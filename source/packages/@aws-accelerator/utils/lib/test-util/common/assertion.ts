import { createLogger } from '../../logger';

import path from 'path';
import { pick, isEqual, isMatch } from 'lodash';

/**
 * Assert API response type
 */
export type ResponseType = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * Assert API call property type
 */
export type AssertApiCallPropsType = {
  serviceName: string;
  apiName: string;
  actualResponse: ResponseType;
  expectedResponse: ResponseType;
};

/**
 * Assertion property type
 */
export type AssertPropsType = {
  serviceName: string;
  apiName: string;
  actualResponse: ResponseType;
};

/**
 * Class to perform assertion test
 */
export class Assertion {
  private logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to extract part of API response
   * @param props {@link AssertApiCallPropsType}
   * @returns
   */
  private async getApiExpectedResponse<T extends ResponseType>(props: AssertApiCallPropsType): Promise<T> {
    try {
      return pick(props.actualResponse, Object.keys(props.expectedResponse)) as T;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.logger.error(
        `[${props.serviceName}:${props.apiName}] expected response ${props.expectedResponse} not found in actual response ${props.actualResponse}. Error: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Function to assert api response
   * @param props {@link AssertApiCallPropsType}
   * @returns
   */
  public async assertApiCall(props: AssertApiCallPropsType): Promise<boolean> {
    const extractedResponse = await this.getApiExpectedResponse(props);
    if (isEqual(extractedResponse, props.expectedResponse)) {
      this.logger.info(`[${props.serviceName}:${props.apiName}] assertion successful`);
      this.logger.info(
        `[${props.serviceName}:${props.apiName}] actual response ${JSON.stringify(
          props.actualResponse,
        )} does match with expected response ${JSON.stringify(props.expectedResponse)}`,
      );
      return true;
    } else {
      this.logger.error(
        `[${props.serviceName}:${props.apiName}] actual response ${JSON.stringify(
          props.actualResponse,
        )} does not match with expected response ${JSON.stringify(props.expectedResponse)}, assertion failed`,
      );
      return false;
    }
  }

  /**
   * Function to assert api response with partial matching
   * @param props {@link AssertApiCallPropsType}
   * @returns
   */
  public async assertApiCallPartial(props: AssertApiCallPropsType): Promise<boolean> {
    const extractedResponse = await this.getApiExpectedResponse(props);
    // Use lodash's isMatch instead of isEqual for partial matching
    if (isMatch(extractedResponse, props.expectedResponse)) {
      this.logger.info(`[${props.serviceName}:${props.apiName}] partial assertion successful`);
      this.logger.info(
        `[${props.serviceName}:${props.apiName}] actual response matches expected subset ${JSON.stringify(
          props.expectedResponse,
        )}`,
      );
      return true;
    } else {
      this.logger.error(
        `[${props.serviceName}:${props.apiName}] actual response does not match expected subset ${JSON.stringify(
          props.expectedResponse,
        )}, assertion failed`,
      );
      return false;
    }
  }
}
