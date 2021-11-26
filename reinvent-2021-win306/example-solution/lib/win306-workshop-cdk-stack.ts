import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as fs from "fs";
import * as cw from "@aws-cdk/aws-cloudwatch";
import { Duration } from "@aws-cdk/core";
import * as cw_actions from "@aws-cdk/aws-cloudwatch-actions";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as loadbalancer from "@aws-cdk/aws-elasticloadbalancingv2";
import * as targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import * as cloud9 from "@aws-cdk/aws-cloud9";

export class Win306WorkshopBaseStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EventEngine Template 3 minutes
    const c9env = new cloud9.Ec2Environment(this, "Cloud9Env", {
      vpc: new ec2.Vpc(this, "Cloud9VPC", { maxAzs: 1,natGateways: 0 }),
      instanceType: new ec2.InstanceType("m5.large"),
    });

    new cdk.CfnOutput(this, "cloud9url", { value: c9env.ideUrl });
  }
}

export class Win306Module1 extends cdk.Stack {
  readonly infra: ec2.IVpc;
  readonly machineVolumeSize: number;
  readonly machineSize: ec2.InstanceType;
  readonly machineUserData: ec2.UserData;
  readonly myWindowsApplication: ec2.Instance;
  readonly machineImage: ec2.LookupMachineImage;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // APPLYING PRINCIPLE #5: MANAGE CHANGE IN AUTOMATION

    this.infra = new ec2.Vpc(this, "win306VPC");

    const userDataScript = fs.readFileSync("./lib/windowsiis.ps1", "utf8");

    this.machineImage = new ec2.LookupMachineImage({
      name: "*Windows_Server-2022-English-Core-Base*",
      windows: true,
    });

    this.machineVolumeSize = 100;

    this.machineSize = new ec2.InstanceType("t3.medium");

    this.machineUserData = ec2.UserData.custom(userDataScript);

    this.myWindowsApplication = new ec2.Instance(this, "IISApplication", {
      vpc: this.infra,
      instanceType: this.machineSize,
      machineImage: this.machineImage,
      vpcSubnets: this.infra.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(this.machineVolumeSize, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      userData: this.machineUserData,
      userDataCausesReplacement: true,
    });

    this.myWindowsApplication.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

    new cdk.CfnOutput(this, "endpoint", {
      value: "http://" + this.myWindowsApplication.instancePublicDnsName,
      description: "Public DNS Name of my application",
      exportName: "DnsAddress",
    });
  }
}

export class Win306Module2 extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    Module1: Win306Module1,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    // APPLYING PRINCIPLE #1: AUTOMATICALLY RECOVER FROM FAILURE

    // CPU Monitoring

    const cpuMetric = new cw.Metric({
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      dimensions: { InstanceId: Module1.myWindowsApplication.instanceId },
      statistic: "max",
      label: "instanceCPU",
      period: Duration.hours(3),
    });

    const cpuAlarm = new cw.Alarm(this, "CPUAlarm", {
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: 80,
      metric: cpuMetric,
    });

    const cpuWidget = new cw.AlarmWidget({
      alarm: cpuAlarm,
      title: "Instance CPU",
    });

    // Network Throughput

    const networkOutMetric = new cw.Metric({
      metricName: "NetworkOut",
      namespace: "AWS/EC2",
      dimensions: {
        InstanceId: Module1.myWindowsApplication.instanceId,
      },
      statistic: "sum",
      label: "NetworkOut",
      period: Duration.minutes(5),
    });

    const networkInMetric = new cw.Metric({
      metricName: "NetworkIn",
      namespace: "AWS/EC2",
      dimensions: {
        InstanceId: Module1.myWindowsApplication.instanceId,
      },
      statistic: "sum",
      label: "NetworkIn",
      period: Duration.minutes(5),
    });

    const totalNetworkMetric = new cw.MathExpression({
      label: "Network Throughput",
      expression: "SUM(METRICS('network'))/PERIOD(networkOut)*0.000008",
      period: Duration.minutes(5),
      usingMetrics: {
        networkOut: networkOutMetric,
        networkIn: networkInMetric,
      },
    });

    const MB_threshold = 625; //  Instance throughput value in Megabytes (5Gbps)

    const unusualNetworkAlarm = new cw.Alarm(this, "unusuallyHighTraffic", {
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: MB_threshold * 8, // MBps to Mbps
      metric: totalNetworkMetric,
    });

    const networkOutWidget = new cw.AlarmWidget({
      alarm: unusualNetworkAlarm,
      title: "Unusual high traffic",
    });

    // System Check

    const systemCheckMetric = new cw.Metric({
      metricName: "StatusCheckFailed_System",
      namespace: "AWS/EC2",
      dimensions: {
        InstanceId: Module1.myWindowsApplication.instanceId,
      },
      statistic: "max",
      label: "Status Check Failed: System",
      period: Duration.minutes(1),
    });

    const systemCheckAlarm = new cw.Alarm(this, "impairedInstanceSystemAlarm", {
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: 0.1,
      metric: systemCheckMetric,
    });

    systemCheckAlarm.addAlarmAction(
      new cw_actions.Ec2Action(cw_actions.Ec2InstanceAction.RECOVER)
    );

    const systemStateWidget = new cw.AlarmWidget({
      alarm: systemCheckAlarm,
      title: "App Instance System Monitoring",
    });

    // Instance Check
    const instanceCheckMetric = new cw.Metric({
      metricName: "StatusCheckFailed_Instance",
      namespace: "AWS/EC2",
      dimensions: {
        InstanceId: Module1.myWindowsApplication.instanceId,
      },
      statistic: "max",
      label: "Status Check Failed: Instance",
      period: Duration.minutes(1),
    });

    const instanceCheckAlarm = new cw.Alarm(this, "impairedInstanceAlarm", {
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: 0.1,
      metric: instanceCheckMetric,
    });

    instanceCheckAlarm.addAlarmAction(
      new cw_actions.Ec2Action(cw_actions.Ec2InstanceAction.REBOOT)
    );

    const appStateWidget = new cw.AlarmWidget({
      alarm: instanceCheckAlarm,
      title: "App Instance Level Monitoring",
    });

    // Cloudwatch Dashboard

    const dashboardName = "MyAppMonitor";

    const cw_dashboard = new cw.Dashboard(this, "AppMonitor", {
      dashboardName: dashboardName,
    });

    cw_dashboard.addWidgets(
      cpuWidget,
      appStateWidget,
      systemStateWidget,
      networkOutWidget
    );

    new cdk.CfnOutput(this, "Cloudwatch Dashboard URL", {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${process.env.CDK_DEFAULT_REGION}#dashboards:name=${dashboardName}`,
    });
  }
}
export class Win306Module3 extends cdk.Stack {
  readonly listener: loadbalancer.ApplicationListener;
  readonly alb: loadbalancer.ApplicationLoadBalancer;
  constructor(
    scope: cdk.Construct,
    id: string,
    Module1: Win306Module1,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // APPLYING PRINCIPLE #3: SCALE HORIZONTALLY TO INCREASE AGGREGATE WORKLOAD AVAILABILITY

    this.alb = new loadbalancer.ApplicationLoadBalancer(
      this,
      "AppLoadBalancer",
      {
        vpc: Module1.infra,
        internetFacing: true,
      }
    );

    this.listener = this.alb.addListener("AppMainListener", { port: 80 });

    new cdk.CfnOutput(this, "AppLoadBalancerEndpoint", {
      value: `http://${this.alb.loadBalancerDnsName}`,
    });

    // Remember to remove
    this.listener.addAction("default", {
      action: loadbalancer.ListenerAction.fixedResponse(200),
    });

    const node1 = this.createInstance("node1", Module1.infra, Module1);
    const node2 = this.createInstance("node2", Module1.infra, Module1);
    const node3 = this.createInstance("node3", Module1.infra, Module1);

    const MyAppTargets = [
      new targets.InstanceTarget(node1, 80),
      new targets.InstanceTarget(node2, 80),
      new targets.InstanceTarget(node3, 80),
    ];

    const MyAppTg = new loadbalancer.ApplicationTargetGroup(this, "MyAppTg", {
      vpc: Module1.infra,
      port: 80,
      targetType: loadbalancer.TargetType.INSTANCE,
      targets: MyAppTargets,
    });

    this.listener.addAction("staticRoute", {
      action: loadbalancer.ListenerAction.forward([MyAppTg]),
    });

    // Shuffle Sharding

    const worker1 = this.createInstance("worker1", Module1.infra, Module1);
    const worker2 = this.createInstance("worker2", Module1.infra, Module1);
    const worker3 = this.createInstance("worker3", Module1.infra, Module1);
    const worker4 = this.createInstance("worker4", Module1.infra, Module1);

    const ShardA = [
      new targets.InstanceTarget(worker1, 80),
      new targets.InstanceTarget(worker2, 80),
    ];
    const ShardB = [
      new targets.InstanceTarget(worker1, 80),
      new targets.InstanceTarget(worker3, 80),
    ];
    const ShardC = [
      new targets.InstanceTarget(worker1, 80),
      new targets.InstanceTarget(worker4, 80),
    ];
    const ShardD = [
      new targets.InstanceTarget(worker2, 80),
      new targets.InstanceTarget(worker3, 80),
    ];
    const ShardE = [
      new targets.InstanceTarget(worker2, 80),
      new targets.InstanceTarget(worker4, 80),
    ];
    const ShardF = [
      new targets.InstanceTarget(worker3, 80),
      new targets.InstanceTarget(worker4, 80),
    ];

    const tg1 = this.createTargetGroup("tg1", Module1.infra, ShardA);
    const tg2 = this.createTargetGroup("tg2", Module1.infra, ShardB);
    const tg3 = this.createTargetGroup("tg3", Module1.infra, ShardC);
    const tg4 = this.createTargetGroup("tg4", Module1.infra, ShardD);
    const tg5 = this.createTargetGroup("tg5", Module1.infra, ShardE);
    const tg6 = this.createTargetGroup("tg6", Module1.infra, ShardF);

    this.createCustomAction("Alpha", tg1, { key: "name", value: "Alpha" }, 1);

    this.createCustomAction("Bravo", tg2, { key: "name", value: "Bravo" }, 2);

    this.createCustomAction(
      "Charlie",
      tg3,
      { key: "name", value: "Charlie" },
      3
    );

    this.createCustomAction("Delta", tg4, { key: "name", value: "Delta" }, 4);

    this.createCustomAction("Echo", tg5, { key: "name", value: "Echo" }, 5);

    this.createCustomAction(
      "Foxtrot",
      tg6,
      { key: "name", value: "Foxtrot" },
      6
    );
  }

  // functions
  createInstance(name: string, infra: ec2.IVpc, Module1: Win306Module1) {
    const instance = new ec2.Instance(this, name, {
      vpc: infra,
      instanceType: Module1.machineSize,
      machineImage: Module1.machineImage,
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(Module1.machineVolumeSize, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      userData: Module1.machineUserData,
      userDataCausesReplacement: true,
    });
    instance.connections.allowFrom(this.alb, ec2.Port.tcp(80));
    return instance;
  }

  createTargetGroup(
    name: string,
    infra: ec2.IVpc,
    targets: loadbalancer.IApplicationLoadBalancerTarget[]
  ) {
    return new loadbalancer.ApplicationTargetGroup(this, name, {
      vpc: infra,
      port: 80,
      targetType: loadbalancer.TargetType.INSTANCE,
      targets: targets,
    });
  }

  createCustomAction(
    name: string,
    where: loadbalancer.ApplicationTargetGroup,
    queryStrings: { key: string; value: string },
    priority: number
  ) {
    this.listener.addAction(name, {
      action: loadbalancer.ListenerAction.forward([where]),
      conditions: [loadbalancer.ListenerCondition.queryStrings([queryStrings])],
      priority: priority,
    });

    new cdk.CfnOutput(this, `LoadBalancerEndpoint-${name}`, {
      value: `http://${this.alb.loadBalancerDnsName}/?name=${name}`,
    });
  }
}

export class Win306Module4 extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    Module1: Win306Module1,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // APPLYING PRINCIPLE #4: STOP GUESSING CAPACITY

    const alb = new loadbalancer.ApplicationLoadBalancer(
      this,
      "AppLoadBalancer",
      {
        vpc: Module1.infra,
        internetFacing: true,
      }
    );

    const listener = alb.addListener("AppMainListenerASG", { port: 80 });

    new cdk.CfnOutput(this, "AppLoadBalancerEndpointWithASG", {
      value: `http://${alb.loadBalancerDnsName}`,
    });

    listener.addAction("default", {
      action: loadbalancer.ListenerAction.fixedResponse(200),
    });

    const windowsNodesASG = new autoscaling.AutoScalingGroup(
      this,
      "WindowsInstancesCapacity",
      {
        vpc: Module1.infra,
        minCapacity: 3, // 1,2,3 cdk taking care of the distribution
        maxCapacity: 10,
        instanceType: new ec2.InstanceType("t3.medium"),
        machineImage: Module1.machineImage,
        userData: Module1.machineUserData,
        blockDevices: [
          {
            deviceName: "/dev/sda1",
            volume: autoscaling.BlockDeviceVolume.ebs(
              Module1.machineVolumeSize,
              {
                volumeType: autoscaling.EbsDeviceVolumeType.GP3,
              }
            ),
          },
        ],
      }
    );

    const autoscaling_targetGroups = new loadbalancer.ApplicationTargetGroup(
      this,
      "autoScalingTargetGroup",
      { targets: [windowsNodesASG], vpc: Module1.infra, port: 80 }
    );

    listener.addTargetGroups("autoscalingTargetGroup", {
      targetGroups: [autoscaling_targetGroups],
    });
  }
}
