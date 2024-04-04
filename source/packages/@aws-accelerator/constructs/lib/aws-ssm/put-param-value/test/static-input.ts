/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly crossAccountProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: genAccArray(1),
    roleName: 'roleName',
    parameters: [{ name: 'name1', value: 'value1' }],
  };
  public static readonly sameAccountProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: ['invokingAccountId'],
    roleName: 'roleName',
    parameters: [{ name: 'name1', value: 'value1' }],
  };
  public static readonly crossAccountAddUpdateNewProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: genAccArray(1),
    roleName: 'roleName',
    parameters: [{ name: 'name1', value: 'value1' }],
  };
  public static readonly crossAccountAddUpdateOldProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: genAccArray(21),
    roleName: 'roleName',
    parameters: [
      { name: 'name2', value: 'value2' },
      { name: 'name1', value: 'newValue1' },
      { name: 'test', value: 'test' },
    ],
  };
  public static readonly crossAccountRemoveUpdateNewProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: genAccArray(2),
    roleName: 'roleName',
    parameters: [{ name: 'name1', value: 'value1' }],
  };
  public static readonly crossAccountRemoveUpdateOldProps = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    roleName: 'roleName',
  };
  public static readonly crossAccountAddUpdateOldProps1 = {
    region: 'region',
    invokingAccountId: 'invokingAccountId',
    parameterAccountIds: genAccArray(2),
    roleName: 'roleName',
  };
}
// function to generate an array of strings based on length of array as input
function genAccArray(length: number) {
  const array: string[] = [];
  for (let i = 0; i < length; i++) {
    array.push(`acc${i.toString().padStart(3, '0')}`);
  }
  return array;
}
