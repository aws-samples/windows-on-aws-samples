#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import {
  Win306Module1,
  Win306Module2,
  Win306Module3,
  Win306Module4,
} from "../lib/win306-workshop-cdk-stack";

const app = new cdk.App();
const env = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};
const module1 = new Win306Module1(app, "win306module1", env);
const module2 = new Win306Module2(app, "win306module2", module1, env);
const module3 = new Win306Module3(app, "win306module3", module1, env);
const module4 = new Win306Module4(app, "win306module4", module1, env);
