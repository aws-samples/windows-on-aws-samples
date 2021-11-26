import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as fs from "fs";
import * as cw from "@aws-cdk/aws-cloudwatch";
import { Duration } from "@aws-cdk/core";
import * as cw_actions from "@aws-cdk/aws-cloudwatch-actions";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as loadbalancer from "@aws-cdk/aws-elasticloadbalancingv2";
import * as targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";

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

    // Cloudwatch Dashboard

    // CPU Monitoring

    // Network Throughput

    // System Check

    // Instance Check
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

    // Instance Fleet with loadbalancer

    // Shuffle Sharding
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
  }
}
