import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { CDKContext } from '../types';


export class EcsFargateStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps, context: CDKContext) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: context.vpc.id });
    
    const loadbalancer = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc,
      internetFacing: true,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${context.appName}-fargate-cluster-${context.environment}`,
    });

    const executionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ],
    });

    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "FargateNodeService", {
        cluster,
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
          logDriver: ecs.LogDrivers.awsLogs({ 
            streamPrefix: `${context.appName}-app-log-group-${context.environment}`, 
            logRetention: context.logRetentionDays
          }),
          secrets: {
            "APP_SECRET": ecs.Secret.fromSecretsManager(sm.Secret.fromSecretCompleteArn(this, "ImportedSecrets", `arn:aws:secretsmanager:eu-central-1:1234567890:secret:${context.secret}`))
          },
          containerName: `${context.appName}-app-container-${context.environment}`,
          family: `${context.appName}-task-defn-${context.environment}`,
          containerPort: 80,
          executionRole,
        },
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        serviceName: "fargate-node-service",
        taskSubnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }),
        loadBalancer: loadbalancer,
      });

  }
}
