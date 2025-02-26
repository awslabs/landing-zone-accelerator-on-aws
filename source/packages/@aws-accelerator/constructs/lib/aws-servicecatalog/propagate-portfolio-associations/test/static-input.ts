import { MakeRoleArn, Partition } from '../../../../test/unit-test/common/resources';
import { PortfolioConfig } from '@aws-accelerator/config';

/**
 * Abstract class to configure static input for propagate-portfolio-associations custom resource AWS Lambda unit testing
 */
const portfolioInput: PortfolioConfig = {
  name: 'testPortfolioName',
  provider: 'testProvider',
  account: 'Management',
  regions: ['us-east-1', 'us-east-2'],
  portfolioAssociations: [
    { type: 'Group', name: 'AdminGroup', propagateAssociation: true },
    { type: 'Role', name: 'AdminRole', propagateAssociation: true },
    { type: 'User', name: 'testUser', propagateAssociation: false },
    { type: 'PermissionSet', name: 'AdminPermissionSet', propagateAssociation: true },
  ],
  products: [
    {
      name: 'productName',
      description: 'productDescription',
      owner: 'productOwner',
      distributor: 'productDistributor',
      versions: [
        {
          name: 'v1',
          description: 'product version description',
          template: 'productVersion1Template',
        },
      ],
      support: {
        description: 'product support description',
        email: 'product support email',
        url: 'product support url',
      },
      tagOptions: undefined,
      constraints: undefined,
    },
  ],
  shareTagOptions: undefined,
  shareTargets: undefined,
  tagOptions: undefined,
};

export abstract class StaticInput {
  public static readonly permissionSetNameLookup = 'AdminPermissionSet';
  public static readonly permissionSetName = 'AWSReservedSSO_AdminPermissionSet_11111111111111111';
  public static readonly permissionSetRoleArn =
    'arn:aws:iam::111111111111:role/AWSReservedSSO_AdminPermissionSet_11111111111111111';
  public static readonly permissionSetName2 = 'AWSReservedSSO_PowerUserPermissionSet_11111111111111111';
  public static readonly permissionSet2RoleArn =
    'arn:aws:iam::111111111111:role/AWSReservedSSO_PowerUserPermissionSet_11111111111111111';
  public static readonly permissionSet2NameLookup = 'PowerUserPermissionSet';
  public static readonly assumeRoleArn1 = MakeRoleArn('crossAccountRole', Partition, '000000000000');
  public static readonly assumeRoleArn2 = MakeRoleArn('crossAccountRole', Partition, '111111111111');
  public static readonly existingRoleArn = MakeRoleArn('AdminRole', Partition, '000000000000');
  public static readonly newProps = {
    portfolioId: 'portfolioId',
    crossAccountRole: 'crossAccountRole',
    portfolioDefinition: JSON.stringify(portfolioInput),
    shareAccountIds: '000000000000,111111111111',
    partition: 'aws',
  };
  public static readonly permissionSetErrorMessage =
    'Unable to find provisioned role for permission set permissionSet in account account';
  public static readonly deleteProps = {
    portfolioId: 'portfolioId',
    crossAccountRole: 'crossAccountRole',
    portfolioDefinition: JSON.stringify(portfolioInput),
    shareAccountIds: '000000000000',
    partition: 'aws',
  };
}
