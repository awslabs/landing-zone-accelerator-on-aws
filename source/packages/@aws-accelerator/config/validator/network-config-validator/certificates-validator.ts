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

import { CertificateConfig, NetworkConfig } from '../../lib/network-config';

export class CertificatesValidator {
  constructor(values: NetworkConfig, errors: string[]) {
    //
    // Validate ACM certificate configurations
    //
    this.validateCertificates(values, errors);
  }
  private validateCertificates(values: NetworkConfig, errors: string[]) {
    const allCertificateNames: string[] = [];
    for (const certificate of values.certificates ?? []) {
      allCertificateNames.push(certificate.name);
      // check certificate import keys
      if (certificate.type === 'import') {
        this.checkImportCertificateInput(certificate, errors);
      }
      // check certificate request keys
      if (certificate.type === 'request') {
        this.checkRequestCertificateInput(certificate, errors);
      }
    }
    // check certificate for duplicate names
    this.checkCertificateForDuplicateNames(allCertificateNames, errors);
  }
  private checkImportCertificateInput(certificate: CertificateConfig, errors: string[]) {
    // when cert is set to import users must mention a privateKey and certificate
    if (!certificate.privKey || !certificate.cert) {
      errors.push(
        `Certificate: ${
          certificate.name
        } is set to import which requires both privKey and cert. Found: ${JSON.stringify(certificate)}`,
      );
    }
  }
  private checkRequestCertificateInput(certificate: CertificateConfig, errors: string[]) {
    // when cert is set to request users must mention a privateKey and certificate
    if (!certificate.domain || !certificate.validation) {
      errors.push(
        `Certificate: ${
          certificate.name
        } is set to request which requires both validation and domain. Found: ${JSON.stringify(certificate)}`,
      );
    }
  }
  private checkCertificateForDuplicateNames(allCertificateNames: string[], errors: string[]) {
    if (allCertificateNames.length > 1) {
      const duplicateCertNames = allCertificateNames.some(element => {
        return allCertificateNames.indexOf(element) !== allCertificateNames.lastIndexOf(element);
      });
      if (duplicateCertNames) {
        errors.push(`There are duplicates in certificate names. Certificate names: ${allCertificateNames.join(',')}`);
      }
    }
  }
}
