import { EC2Client, Vpc } from '@aws-sdk/client-ec2';
import { HostedZone, Route53Client } from '@aws-sdk/client-route-53';

export interface AssumeRoleAccountCredentials {
  account: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
}

export interface AllAccountsCredentialParams {
  accountIds: string[];
  roleName: string;
  solutionId?: string;
  region: string;
  partition: string;
  roleSessionName: string;
  hostedZoneAccountId: string;
}

export interface AssumeRoleParams {
  accountId: string;
  roleName: string;
  solutionId?: string;
  region: string;
  partition: string;
  roleSessionName: string;
}

export interface AWSClients {
  [key: string]: {
    ec2Client: EC2Client;
    route53Client: Route53Client;
  };
}

export interface DescribeVpcByTagFiltersParams {
  account: string;
  ec2Client: EC2Client;
  tagFilters?: TagFilter[];
}

export interface VpcItem {
  account: string;
  hostedZoneAccount: string | undefined;
  vpc: Vpc;
}

export interface HostedZoneItem {
  hostedZone: HostedZone | undefined;
  vpcId: string | undefined;
  region: string | undefined;
}

export interface SetClientsParams {
  assumeRoleCredentials: AssumeRoleAccountCredentials[];
  solutionId?: string;
  hostedZoneAccountId: string;
}
export interface TagFilter {
  key: string;
  value: string;
}

export interface VpcAssociationItem {
  account: string;
  hostedZoneAccountId: string;
  hostedZoneParams: {
    HostedZoneId: string;
    VPC: {
      VPCId: string;
      VPCRegion: string;
    };
  };
}

export interface VpcAssociation {
  [key: string]: VpcAssociationItem[];
}

export interface CfnResponse {
  PhysicalResourceId: string | undefined;
  Status: string;
}
