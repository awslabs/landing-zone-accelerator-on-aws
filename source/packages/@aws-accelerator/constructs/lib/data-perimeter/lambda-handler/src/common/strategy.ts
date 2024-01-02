import { AwsResourcePolicyStrategy as AwsResourcePolicyStrategy } from './aws-resource-policy-strategy';
import { ApiGatewayPolicyStrategy } from './strategies/apigateway-repository-policy-strategy';
import { BackupVaultPolicyStrategy } from './strategies/backup-valut-policy-strategy';
import { CodeArtifactRepositoryPolicyStrategy } from './strategies/code-artifact-repository-policy-strategy';
import { EcrRepositoryPolicyStrategy } from './strategies/ecr-repository-policy-strategy';
import { EfsFileSystemPolicyStrategy } from './strategies/efs-file-system-policy-strategy';
import { EventBridgeEventBusPolicyStrategy } from './strategies/eventbridge-eventbus-policy-strategy';
import { IamRolePolicyStrategy } from './strategies/iam-role-policy-strategy';
import { KmsKeyPolicyStrategy } from './strategies/kms-key-policy-strategy';
import { LexBotPolicyStrategy } from './strategies/lex-bot-policy-strategy';
import { OpenSearchDomainPolicyStrategy } from './strategies/opensearch-domain-policy-strategy';
import { PcaPolicyStrategy } from './strategies/pca-policy-strategy';
import { S3BucketPolicyStrategy } from './strategies/s3-bucket-policy-strategy';
import { SecretsManagerPolicyStrategy } from './strategies/secrets-manager-policy-streategy';
import { SnsPolicyStrategy } from './strategies/sns-policy-strategy';
import { SqsPolicyStrategy } from './strategies/sqs-policy-strategy';
import { ResourceType } from './common-resources';
import { LambdaPolicyStrategy } from './strategies/lambda-policy-strategy';

let map: Map<ResourceType, AwsResourcePolicyStrategy>;

export function getOrCreateStrategyMap(): Map<string, AwsResourcePolicyStrategy> {
  if (map) return map;

  map = new Map();

  map.set(ResourceType.S3_BUCKET, new S3BucketPolicyStrategy());
  map.set(ResourceType.IAM_ROLE, new IamRolePolicyStrategy());
  map.set(ResourceType.KMS_KEY, new KmsKeyPolicyStrategy());
  map.set(ResourceType.SECRETS_MANAGER_SECRET, new SecretsManagerPolicyStrategy());
  map.set(ResourceType.APIGATEWAY_REST_API, new ApiGatewayPolicyStrategy());
  map.set(ResourceType.ECR_REPOSITORY, new EcrRepositoryPolicyStrategy());
  map.set(ResourceType.LEX_BOT, new LexBotPolicyStrategy());
  map.set(ResourceType.OPENSEARCH_DOMAIN, new OpenSearchDomainPolicyStrategy());
  map.set(ResourceType.SNS_TOPIC, new SnsPolicyStrategy());
  map.set(ResourceType.SQS_QUEUE, new SqsPolicyStrategy());
  map.set(ResourceType.CODEARTIFACT_REPOSITORY, new CodeArtifactRepositoryPolicyStrategy());
  map.set(ResourceType.EFS_FILE_SYSTEM, new EfsFileSystemPolicyStrategy());
  map.set(ResourceType.EVENTBRIDGE_EVENTBUS, new EventBridgeEventBusPolicyStrategy());
  map.set(ResourceType.BACKUP_VAULT, new BackupVaultPolicyStrategy());
  map.set(ResourceType.CERTIFICATE_AUTHORITY, new PcaPolicyStrategy());
  map.set(ResourceType.LAMBDA_FUNCTION, new LambdaPolicyStrategy());

  return map;
}
