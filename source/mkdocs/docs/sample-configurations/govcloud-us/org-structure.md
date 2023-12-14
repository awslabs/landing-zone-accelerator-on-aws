# Organization and Account Structure

An overview of the LZA organizational structure is shown in the following image. However, you are free to change the organizational structure, Organizational Units (OUs), and accounts to meet your specific needs.

For additional information about how to best organize your AWS OU and account structure, please reference the Recommended OUs and accounts in the For Further Consideration section below as you begin to experiment.

![](./images/image1.png)

By default, the config builds the above organizational structure, with the exception of the Infrastructure and Security OU, which are predefined by you prior to launching the LZA. The following provides an overview of the network infrastructure.

The Infrastructure OU provides the following specialized functions:

- The GovCloudNetwork account contains a network inspection VPC for inspecting AWS traffic as well as routing traffic to and from the Internet. Traffic will flow through the Network-Main Transit Gateway, where it can be inspected by AWS Network Firewall before being blocked or continuing to the internet or its final destination.

- The GovCloudSharedServices VPC is intended to house centrally shared services that are accessible to all of the accounts in the infrastructure. For example, you might deploy central security services such as Endpoint Detection and Response (EDR) or a central directory service such as LDAP. This central location and corresponding route tables allow you to efficiently design your network and compartmentalize access control accordingly