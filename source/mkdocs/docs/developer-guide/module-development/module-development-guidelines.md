# Module Development Guidelines

## 1. Prerequisites
- Node.js (Latest LTS version)
- AWS CDK
- TypeScript
- AWS SDK for JavaScript/TypeScript

## 2. Basic Module Requirements
- Each module must be self-contained
- Implement proper error handling
- Include comprehensive testing
- Follow AWS SDK best practices
- Use strong typing with TypeScript
- Must implement the corresponding interface contract

## 3. Core Components

### Module Implementation
- All module code resides in `source/packages/@aws-lza/lib`
- Each module should have its dedicated folder (e.g., `control-tower`, `macie`)
- Must have an `index.ts` file implementing the module interface

### Common Resources
- Shared functions and constants are stored in `source/packages/@aws-lza/common`
- Reusable components should be properly documented and maintained

### Module Executors
- Entry points for each module are in `source/packages/@aws-lza/executors`
- Example: `accelerator-control-tower.ts` serves as the entry point for Control Tower operations

```typescript
export async function setupControlTowerLandingZone(input: ISetupLandingZoneHandlerParameter): Promise<string> {
  try {
    return await new SetupLandingZoneModule().handler(input);
  } catch (e: unknown) {
    console.error(e);
    throw new Error(`${e}`);
  }
}
```

## 4. Testing Requirements

### Unit Testing
- Implementation using Jest testing framework
- 100% line coverage requirement
- Test files named as `<module-name>.test.unit.ts`
- Located in `source/packages/@aws-lza/test/lib/<module-name>`
- Must include interface contract compliance tests

#### Interface Contract Compliance Testing
Contract testing verifies that a module correctly implements its interface requirements. For example:

```typescript
// interfaces/control-tower/setup-landing-zone.ts
export interface SetupLandingZoneModule {
  handler(props: ISetupLandingZoneHandlerParameter): Promise<string>;
}

// setup-landing-zone.test.unit.ts
describe('SetupLandingZoneModule Contract Compliance', () => {
  const input: ISetupLandingZoneHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: MOCK_CONSTANTS.setupControlTowerLandingZoneConfiguration,
  };
  let module: SetupLandingZoneModule;

  beforeEach(() => {
    module = new SetupLandingZoneModule();
    // Mock the handler implementation
    jest.spyOn(module, 'handler').mockImplementation(async () => 'mocked-response');
  });

  test('should implement all interface methods', () => {
    expect(module.handler).toBeDefined();
    expect(typeof module.handler).toBe('function');
  });

  test('should maintain correct method signatures', async () => {
    const result = module.handler(input);
    // Verify that handler returns a Promise
    expect(result).toBeInstanceOf(Promise);
    // Verify that the resolved value is a string
    await expect(result).resolves.toBe('mocked-response');
    await expect(result).resolves.toEqual(expect.any(String));
  });

  test('should handle invalid inputs according to contract', async () => {
    // Reset mock to test error handling
    jest.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

    await expect(module.handler({} as ISetupLandingZoneHandlerParameter)).rejects.toThrow('Invalid input parameters');
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(input);
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
```

### Integration Testing
- Mandatory for each module
- Tests actual AWS account deployments
- Verifies expected outcomes
- Test files named as `<module-name>.test.integration.ts`
- Located in `source/packages/@aws-lza/test/<module-name>`

### Test Utilities
- Common test utilities stored in `source/packages/@aws-lza/test/utils`
- Includes mock constants and shared test functions

## 5. Module Development Best Practices

### Code Organization
```typescript
// Example module structure
export class ModuleImplementation implements IModuleInterface {

    public async handler(props: <ModuleProps>): Promise<string> {
        // Implementation logic
    }
}
```

## 6. Interface Implementation Requirements

1. **Interface Location**
      - All interfaces must be in `source/packages/@aws-lza/interfaces/`
      - Named according to module name (e.g., `macie.ts`, `control-tower.ts`)

2. **Implementation Requirements**
      - Must implement all methods defined in the interface
      - Located in module's `index.ts`
      - Strict type compliance
      - Complete error handling

3. **Contract Validation**
      - All interface methods must be implemented
      - Type safety must be maintained
      - No additional public methods beyond interface

## 7. Security Considerations
- Follow AWS security best practices
- Implement proper IAM roles and policies
- Use secure communication channels
- Implement encryption where necessary
- Follow least privilege principle

## 8. Documentation Requirements
- Document interface contracts
- Include method descriptions
- Document parameter types and returns
- Provide usage examples

For more information refer [doc-guidelines](./doc-guidelines.md)


## 9. Deployment Guidelines
- Ensure proper testing before deployment
- Implement rollback mechanisms
- Document deployment prerequisites
- Maintain version compatibility

## 10. Maintenance
- Regular updates and security patches
- Performance optimization
- Backward compatibility considerations
- Documentation updates

---

[← Back to Module Development Guide](./index.md)

[Integration Guide: Using LZA Modules →](./integration-guide.md)