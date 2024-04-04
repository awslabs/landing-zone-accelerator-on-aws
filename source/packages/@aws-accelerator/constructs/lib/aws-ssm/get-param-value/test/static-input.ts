/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly crossAccountProps = {
    parameterRegion: 'parameterRegion',
    invokingAccountID: 'invokingAccountID',
    parameterAccountID: 'parameterAccountID',
    assumeRoleArn: 'assumeRoleArn',
    parameterName: 'parameterName',
  };
  public static readonly sameAccountProps = {
    parameterRegion: 'parameterRegion',
    invokingAccountID: 'invokingAccountID',
    parameterAccountID: 'invokingAccountID',
    assumeRoleArn: 'assumeRoleArn',
    parameterName: 'parameterName',
  };
}
