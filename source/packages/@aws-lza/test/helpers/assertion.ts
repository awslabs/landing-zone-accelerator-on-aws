/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import path from 'path';
import { pick, isEqual, isMatch } from 'lodash';
import { createLogger } from '../../common/logger';

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
    } catch (error: unknown) {
      this.logger.error(
        `[${props.serviceName}:${props.apiName}] expected response ${props.expectedResponse} not found in actual response ${props.actualResponse}. Error: ${error}`,
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
