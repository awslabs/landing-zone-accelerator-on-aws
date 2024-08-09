/**
 * aws-controltower-opt-in-regions - lambda handler
 *
 * @param event
 * @returns
 */
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { AccountClient, GetRegionOptStatusCommand, EnableRegionCommand } from '@aws-sdk/client-account';
import { OptInRegions } from '@aws-accelerator/utils/lib/regions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import pLimit from 'p-limit';

interface OptInRegionsProps {
  managementAccountId: string;
  accountIds: string[];
  homeRegion: string;
  enabledRegions: string[];
  globalRegion: string;
}

const solutionId: string = process.env['SOLUTION_ID'] ?? '';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  const props = event.ResourceProperties['props'];

  // Perform operation to check completion
  const IsComplete = await processAllAccountsRegions(props);

  return {
    IsComplete,
  };
}

async function processAllAccountsRegions(props: OptInRegionsProps) {
  console.log(props);
  const limit = pLimit(20);
  const promises = [];
  const accountClient = new AccountClient({
    region: props.homeRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  }) as AccountClient;
  for (const accountId of props.accountIds) {
    for (const enabledRegion of props.enabledRegions.filter(region => OptInRegions.includes(region)) ?? []) {
      let promise;
      if (accountId === props.managementAccountId) {
        promise = limit(() => processAccountRegion(undefined, accountClient, enabledRegion));
      } else {
        promise = limit(() => processAccountRegion(accountId, accountClient, enabledRegion));
      }
      promises.push(promise);
    }
  }

  const results = await Promise.all(promises);
  return results.every(state => state.isComplete);
}

async function processAccountRegion(accountId: string | undefined, accountClient: AccountClient, optinRegion: string) {
  try {
    const optStatus = await checkRegionOptStatus(accountClient, optinRegion, accountId);
    console.log(`Current opt status for region ${optinRegion} for account ${accountId || 'management'}: ${optStatus}`);
    if (optStatus === 'DISABLED') {
      console.log(`Opt-in initialized for ${optinRegion} for account ${accountId || 'management'}`);
      await enableOptInRegion(accountClient, optinRegion, accountId);
      return { accountId, isComplete: false };
    } else if (optStatus === 'ENABLING' || optStatus === 'DISABLING') {
      console.log(`Opt-in in progress for ${optinRegion} for account ${accountId || 'management'}`);
      return { accountId, isComplete: false };
    } else {
      console.log(`Opt-in in complete for ${optinRegion} for account ${accountId || 'management'}`);
      return { accountId, isComplete: true };
    }
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    console.log(`Error opting in to region ${optinRegion} in account ${accountId || 'management'}: ${e.message}`);
    return { accountId, isComplete: false };
  }
}

async function checkRegionOptStatus(
  client: AccountClient,
  optinRegion: string,
  accountId: string | undefined,
): Promise<string | undefined> {
  try {
    const command = new GetRegionOptStatusCommand({
      RegionName: optinRegion,
      ...(accountId && { AccountId: accountId }),
    });
    const response = await throttlingBackOff(() => client.send(command));
    return response.RegionOptStatus;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    console.log(`Error checking region opt status for ${accountId || 'management'} : ${e.message}`);
    throw e;
  }
}

async function enableOptInRegion(
  client: AccountClient,
  optinRegion: string,
  accountId: string | undefined,
): Promise<void> {
  try {
    const command = new EnableRegionCommand({ RegionName: optinRegion, ...(accountId && { AccountId: accountId }) });
    await throttlingBackOff(() => client.send(command));
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    console.log(`Error opting in to region ${optinRegion} for ${accountId || 'management'} : ${e.message}`);
    throw e;
  }
}
