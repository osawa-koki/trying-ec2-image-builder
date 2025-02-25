# trying-ec2-image-builder

🍧🍧🍧 EC2 Image Builderを試してみる！  

![成果物](./fruit.gif)  

## 実行方法

`.env.example`をコピーして`.env`ファイルを作成します。  
中身を適切に設定してください。  

DevContainerに入り、以下のコマンドを実行します。  
※ `~/.aws/credentials`にAWSの認証情報があることを前提とします。  

```shell
cdk bootstrap
cdk synth
cdk deploy --require-approval never --all
```

これで、EC2 Image Builderのイメージパイプラインが作成されます。  

続いて、イメージパイプラインの実行と、作成したAMIからEC2インスタンスの作成を行います。  

```shell
# 環境変数の読み込み
source .env

# イメージパイプラインのARNを取得
IMAGE_PIPELINE_ARN=$(aws cloudformation describe-stacks --stack-name ${BASE_STACK_NAME} --query 'Stacks[0].Outputs[?OutputKey==`ImagePipelineArn`].OutputValue' --output text)

# イメージパイプラインの実行
EXECUTION_RESULT=$(aws imagebuilder start-image-pipeline-execution --image-pipeline-arn $IMAGE_PIPELINE_ARN)

# イメージパイプラインの実行状況を取得
# `imageSummaryList[].state.status`が`AVAILABLE`になるまで待つ。
aws imagebuilder list-image-pipeline-images --image-pipeline-arn $IMAGE_PIPELINE_ARN
aws imagebuilder list-image-pipeline-images --image-pipeline-arn $IMAGE_PIPELINE_ARN | jq -r '.imageSummaryList[] | .state.status'

# AMIのIDを取得
AMI_RESULT=$(aws imagebuilder list-image-pipeline-images --image-pipeline-arn $IMAGE_PIPELINE_ARN --query 'imageSummaryList[?state.status==`AVAILABLE`].{
  Name:name,
  Version:version,
  Status:state.status,
  AMI_ID:outputResources.amis[0].image,
  Region:outputResources.amis[0].region,
  Created:dateCreated
}' --output json)
AMI_ID=$(echo $AMI_RESULT | jq -r '.[-1].AMI_ID')

# EC2インスタンスを作成
# 公開鍵は`~/.ssh/id_rsa.pub`にあると仮定しています。
aws cloudformation create-stack --stack-name ${BASE_STACK_NAME}-ec2-stack \
  --template-body file://template.yml \
  --parameters \
    ParameterKey=AmiId,ParameterValue=${AMI_ID} \
    ParameterKey=PublicKeyMaterial,ParameterValue="$(cat ~/.ssh/id_rsa.pub)" \
    ParameterKey=InstanceType,ParameterValue=t3.micro

# スタックの作成状況を確認
# `Stacks[0].StackStatus`が`CREATE_COMPLETE`になるまで待つ。
aws cloudformation describe-stacks --stack-name ${BASE_STACK_NAME}-ec2-stack
aws cloudformation describe-stacks --stack-name ${BASE_STACK_NAME}-ec2-stack | jq -r '.Stacks[0].StackStatus'

# EC2インスタンスに接続
# 秘密鍵は`~/.ssh/id_rsa`にあると仮定しています。
EC2_PUBLIC_IP=$(aws cloudformation describe-stacks --stack-name ${BASE_STACK_NAME}-ec2-stack --query 'Stacks[0].Outputs[?OutputKey==`InstancePublicIp`].OutputValue' --output text)
ssh -i ~/.ssh/id_rsa ec2-user@${EC2_PUBLIC_IP}

# ===== 以下は、EC2インスタンスにログインした後の操作 =====

sudo vim /etc/nginx/nginx.conf

##### Before
# server {
#     listen       80;
#     listen       [::]:80;
##### After
#     listen       8000;
#     listen       [::]:8000;
# に変更

sudo systemctl restart nginx

# ブラウザで`http://${EC2_PUBLIC_IP}:8000`にアクセスしてください。
# or `curl ${EC2_PUBLIC_IP}:8000`
# デフォルトのページ(Nginxのデフォルトページ)が表示されれば成功です。

# ----- ----- -----

sudo vim /etc/httpd/conf/httpd.conf

##### Before
# # Listen: Allows you to bind Apache to specific IP addresses and/or
# # ports, instead of the default. See also the <VirtualHost>
# # directive.
# #
# # Change this to Listen on a specific IP address, but note that if
# # httpd.service is enabled to run at boot time, the address may not be
# # available when the service starts.  See the httpd.service(8) man
# # page for more information.
# #
# #Listen 12.34.56.78:80
# Listen 80
##### After
# # Listen: Allows you to bind Apache to specific IP addresses and/or
# # ports, instead of the default. See also the <VirtualHost>
# # directive.
# #
# # Change this to Listen on a specific IP address, but note that if
# # httpd.service is enabled to run at boot time, the address may not be
# # available when the service starts.  See the httpd.service(8) man
# # page for more information.
# #
# #Listen 12.34.56.78:80
# Listen 8080
# に変更

sudo systemctl restart httpd

# ブラウザで`http://${EC2_PUBLIC_IP}:8080`にアクセスしてください。
# or `curl ${EC2_PUBLIC_IP}:8080`
# デフォルトのページ(Apacheのデフォルトページ)が表示されれば成功です。
```

削除する場合は、以下のコマンドを実行します。  

```shell
aws cloudformation delete-stack --stack-name ${BASE_STACK_NAME}-ec2-stack
cdk destroy --all
```

---

GitHub Actionsでデプロイするためには、以下のシークレットを設定してください。  

| シークレット名 | 説明 |
| --- | --- |
| AWS_ROLE_ARN | IAMロールARN (Ref: https://github.com/osawa-koki/oidc-integration-github-aws) |
| AWS_REGION | AWSリージョン |
| DOTENV | `.env`ファイルの内容 |

タグをプッシュすると、GitHub Actionsがデプロイを行います。  
手動でトリガーすることも可能です。  
