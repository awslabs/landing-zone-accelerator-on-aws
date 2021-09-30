import { OrganizationsClient, paginateListRoots } from '@aws-sdk/client-organizations';

/**
 * list-roots - lambda handler
 *
 *
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const name: string = event.ResourceProperties['name'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const organizationsClient = new OrganizationsClient({});
      for await (const page of paginateListRoots({ client: organizationsClient }, {})) {
        for (const root of page.Roots ?? []) {
          if (root.Name === name) {
            console.log(root.Id);
            return {
              PhysicalResourceId: root.Id,
              Status: 'SUCCESS',
            };
          }
        }
      }
      throw new Error('Root ID not found');
    case 'Delete':
      // Do Nothing, we will leave any created OUs behind
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
