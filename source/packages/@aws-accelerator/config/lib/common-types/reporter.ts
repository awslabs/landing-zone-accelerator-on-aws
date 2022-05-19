/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Context, getFunctionName, ValidationError } from 'io-ts';
import { Reporter } from 'io-ts/lib/Reporter';
import { fold } from 'fp-ts/lib/Either';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stringify(v: any): string {
  if (typeof v === 'function') {
    return getFunctionName(v);
  }
  if (typeof v === 'number' && !isFinite(v)) {
    if (isNaN(v)) {
      return 'NaN';
    }
    return v > 0 ? 'Infinity' : '-Infinity';
  }
  return JSON.stringify(v);
}

function getContextPath(context: Context): string {
  return context.map(({ key }) => key).join('/');
}

function getMessage(e: ValidationError): string {
  return e.message !== undefined
    ? `${e.message} at ${getContextPath(e.context)}`
    : `Invalid value ${stringify(e.value)} supplied to ${getContextPath(e.context)}`;
}

/**
 * @since 1.0.0
 */
export function failure(es: ValidationError[]): string[] {
  return es.map(getMessage);
}

/**
 * @since 1.0.0
 */
export function success(): string[] {
  return ['No errors!'];
}

/**
 * @since 1.0.0
 */
export const PathReporter: Reporter<string[]> = {
  report: fold(failure, success),
};
