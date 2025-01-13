import * as cdk from 'aws-cdk-lib';
import * as imagebuilder from 'aws-cdk-lib/aws-imagebuilder';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class IndexStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      stackName: process.env.BASE_STACK_NAME!,
    });

    const vpc = new ec2.Vpc(this, 'ImageBuilderVpc', {
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, 'ImageBuilderSG', {
      vpc,
      description: 'Security group for Image Builder',
      allowAllOutbound: true,
    });

    const imageBuilderRole = new iam.Role(this, 'ImageBuilderRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
      ],
    });

    const instanceProfile = new iam.InstanceProfile(this, 'ImageBuilderInstanceProfile', {
      role: imageBuilderRole,
    });

    const nginxComponent = new imagebuilder.CfnComponent(this, 'NginxComponent', {
      name: 'NginxInstallComponent',
      platform: 'Linux',
      version: '1.0.0',
      data: `
        name: NginxInstallComponent
        description: Installs Nginx web server
        schemaVersion: 1.0
        phases:
          - name: build
            steps:
              - name: InstallNginx
                action: ExecuteBash
                inputs:
                  commands:
                    - yum update -y
                    - yum install -y nginx
                    - systemctl enable nginx
      `,
    });

    const recipe = new imagebuilder.CfnImageRecipe(this, 'WebServerRecipe', {
      name: 'WebServerRecipe',
      version: '1.0.0',
      components: [
        {
          componentArn: nginxComponent.attrArn,
        },
      ],
      parentImage: 'arn:aws:imagebuilder:ap-northeast-1:aws:image/amazon-linux-2023-x86/2023.10.10',
    });

    const infrastructureConfiguration = new imagebuilder.CfnInfrastructureConfiguration(
      this,
      'InfraConfig',
      {
        name: 'WebServerInfraConfig',
        instanceTypes: ['t3.micro'],
        instanceProfileName: instanceProfile.instanceProfileName,
        subnetId: vpc.publicSubnets[0].subnetId,
        securityGroupIds: [securityGroup.securityGroupId],
      }
    );

    new imagebuilder.CfnImagePipeline(this, 'WebServerPipeline', {
      name: 'WebServerPipeline',
      imageRecipeArn: recipe.attrArn,
      infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
      schedule: {
        scheduleExpression: 'cron(0 0 1 * ? *)',
      },
    });
  }
}
