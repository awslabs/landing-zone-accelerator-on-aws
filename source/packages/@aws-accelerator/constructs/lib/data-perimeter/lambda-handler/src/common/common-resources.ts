import { PolicyStatementType } from '@aws-accelerator/utils';

/**
 * Supported Resource Type for AWS Config Rule
 */
export enum ResourceType {
  S3_BUCKET = 'AWS::S3::Bucket',
  KMS_KEY = 'AWS::KMS::Key',
  IAM_ROLE = 'AWS::IAM::Role',
  SECRETS_MANAGER_SECRET = 'AWS::SecretsManager::Secret',
  ECR_REPOSITORY = 'AWS::ECR::Repository',
  OPENSEARCH_DOMAIN = 'AWS::OpenSearch::Domain',
  SNS_TOPIC = 'AWS::SNS::Topic',
  SQS_QUEUE = 'AWS::SQS::Queue',
  APIGATEWAY_REST_API = 'AWS::ApiGateway::RestApi',
  LEX_BOT = 'AWS::Lex::Bot',
  EFS_FILE_SYSTEM = 'AWS::EFS::FileSystem',
  EVENTBRIDGE_EVENTBUS = 'AWS::Events::EventBus',
  BACKUP_VAULT = 'AWS::Backup::BackupVault',
  CODEARTIFACT_REPOSITORY = 'AWS::CodeArtifact::Repository',
  CERTIFICATE_AUTHORITY = 'AWS::ACMPCA::CertificateAuthority',
  LAMBDA_FUNCTION = 'AWS::Lambda::Function',
}

/**
 * Policy Document
 */
export type PolicyDocument = {
  Version: string;
  Id?: string;
  Statement: PolicyStatementType[];
};

/**
 * event input in lambda for Custom AWS Config Rule
 */
export type ConfigRuleEvent = {
  invokingEvent: string; // This is a stringified JSON.
  ruleParameters?: string;
  resultToken: string;
  executionRoleArn?: string;
  configRuleArn: string;
  configRuleName: string;
  configRuleId: string;
  accountId: string;
};

/**
 * The schema of invokingEvent in ConfigRuleEvent
 */
export type InvokingEvent = {
  configurationItem?: ConfigurationItem;
  messageType: string;
};

export type ConfigurationItem = {
  relatedEvents: string[];
  configurationStateId: number;
  version: string;
  configurationItemCaptureTime: string;
  configurationItemStatus: string;
  configurationStateMd5Hash: string;
  ARN: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  AWSAccountId: string;
  supplementaryConfiguration?: { BucketPolicy?: { policyText: string }; Policy?: string };
  configuration?: {
    id?: string;
    keyManager?: string;
    path?: string;
    assumeRolePolicyDocument?: string;
    RepositoryPolicyText?: string;
    AccessPolicies?: PolicyDocument;
    Policy?: string;
    DomainName?: string;
    RepositoryName?: string;
    FileSystemPolicy?: PolicyDocument;
  };
};
