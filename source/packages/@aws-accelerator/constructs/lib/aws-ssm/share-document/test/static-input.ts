/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly createProps = {
    name: 'name',
    accountIds: genAccArray(1),
  };
  public static readonly updatePropsNew = {
    name: 'name',
    accountIds: genAccArray(21),
  };
  public static readonly manyAccounts = genAccArray(100);
}
// function to generate an array of strings based on length of array as input
export function genAccArray(length: number) {
  const array: string[] = [];
  for (let i = 0; i < length; i++) {
    array.push(`acc${i.toString().padStart(3, '0')}`);
  }
  return array;
}
