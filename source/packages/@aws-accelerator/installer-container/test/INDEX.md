# Test Documentation Index

## 🚀 Quick Start

**New to testing this package?** Start here: [../TESTING.md](../TESTING.md)

```bash
# Run tests
yarn test:unit

# Update snapshots after changes
yarn test:unit -u
```

## 📚 Documentation Guide

### For Different Audiences

| You want to... | Read this |
|----------------|-----------|
| **Run tests quickly** | [TESTING.md](../TESTING.md) - Quick reference |
| **Understand the tests** | [README.md](./README.md) - Detailed documentation |
| **Add new tests** | [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guide |
| **See what was built** | [SUMMARY.md](./SUMMARY.md) - Implementation summary |
| **Navigate docs** | [INDEX.md](./INDEX.md) - This file |

### Documentation Hierarchy

```
📄 TESTING.md (Package Root)
    ↓ Quick reference, common commands
    │
    ├─→ 📘 test/README.md
    │       ↓ Comprehensive guide
    │       ├─ Test structure
    │       ├─ Running tests
    │       ├─ Test scenarios
    │       ├─ Troubleshooting
    │       └─ Best practices
    │
    ├─→ 📗 test/CONTRIBUTING.md
    │       ↓ How to contribute
    │       ├─ Writing tests
    │       ├─ Modifying tests
    │       ├─ Code review
    │       └─ Examples
    │
    ├─→ 📙 test/SUMMARY.md
    │       ↓ What was implemented
    │       ├─ Files created
    │       ├─ Coverage metrics
    │       ├─ Key features
    │       └─ Verification
    │
    └─→ 📑 test/INDEX.md (This file)
            ↓ Navigation guide
```

## 🎯 Common Tasks

### I want to...

#### Run Tests
```bash
yarn test:unit
```
📖 More: [TESTING.md](../TESTING.md#quick-start)

#### Add a New Test
1. Read: [CONTRIBUTING.md](./CONTRIBUTING.md#writing-your-first-test)
2. Add test to `installer-container-stack.test.ts`
3. Run: `yarn test:unit`
4. Review snapshot
5. Commit

#### Update Snapshots
```bash
yarn test:unit -u
```
⚠️ Always review diffs first!
📖 More: [README.md](./README.md#updating-snapshots)

#### Understand Test Failures
1. Read error message
2. Check: [README.md](./README.md#troubleshooting)
3. Review snapshot diff
4. Investigate changes

#### Review Test Coverage
```bash
yarn test:unit --coverage
```
📖 More: [TESTING.md](../TESTING.md#configuration)

## 📁 File Reference

### Test Files

| File | Purpose | Lines | Documentation |
|------|---------|-------|---------------|
| `snapshot-test.ts` | Utility functions | 75 | Inline comments |
| `installer-container-stack.test.ts` | Test cases | 175 | Extensive comments |
| `__snapshots__/*.snap` | CloudFormation templates | 350KB | Auto-generated |

### Documentation Files

| File | Purpose | Audience | Length |
|------|---------|----------|--------|
| [TESTING.md](../TESTING.md) | Quick reference | All users | 350 lines |
| [README.md](./README.md) | Detailed guide | Test users | 450 lines |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guide | Contributors | 450 lines |
| [SUMMARY.md](./SUMMARY.md) | Implementation summary | Reviewers | 200 lines |
| [INDEX.md](./INDEX.md) | Navigation | All users | This file |

### Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Test configuration, module aliases |
| `package.json` | Dependencies (@aws-cdk/assert) |

## 🔍 Finding Information

### By Topic

| Topic | Location |
|-------|----------|
| **Running tests** | [TESTING.md](../TESTING.md#quick-start) |
| **Test scenarios** | [README.md](./README.md#test-cases) |
| **Adding tests** | [CONTRIBUTING.md](./CONTRIBUTING.md#writing-your-first-test) |
| **Updating snapshots** | [README.md](./README.md#updating-snapshots) |
| **Troubleshooting** | [README.md](./README.md#troubleshooting) |
| **Best practices** | [README.md](./README.md#best-practices) |
| **Code review** | [CONTRIBUTING.md](./CONTRIBUTING.md#code-review-checklist) |
| **Coverage** | [TESTING.md](../TESTING.md#configuration) |
| **CI/CD** | [TESTING.md](../TESTING.md#cicd-integration) |

### By Question

| Question | Answer |
|----------|--------|
| How do I run tests? | [TESTING.md](../TESTING.md#quick-start) |
| What do the tests cover? | [README.md](./README.md#test-cases) |
| How do I add a test? | [CONTRIBUTING.md](./CONTRIBUTING.md#writing-your-first-test) |
| Why did my test fail? | [README.md](./README.md#troubleshooting) |
| How do I update snapshots? | [README.md](./README.md#updating-snapshots) |
| What was implemented? | [SUMMARY.md](./SUMMARY.md) |
| How do I contribute? | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## 🧪 Test Architecture

```
┌─────────────────────────────────────────┐
│  installer-container-stack.test.ts      │
│  ┌─────────────────────────────────┐   │
│  │ Test 1: Default Config          │   │
│  │ Test 2: External Pipeline       │   │
│  │ Test 3: Permission Boundary     │   │
│  │ Test 4: S3 Source              │   │
│  │ Test 5: Single Account         │   │
│  └─────────────────────────────────┘   │
│              ↓ uses                     │
│  ┌─────────────────────────────────┐   │
│  │ snapshot-test.ts                │   │
│  │ - snapShotTest()                │   │
│  │ - Serializers                   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ↓ generates
┌─────────────────────────────────────────┐
│  __snapshots__/                         │
│  └── installer-container-stack.test.ts.snap │
│      (CloudFormation templates)         │
└─────────────────────────────────────────┘
```

## 📊 Test Coverage

Current metrics:
- ✅ **5 test scenarios** covering key configurations
- ✅ **92.54%** statement coverage
- ✅ **77.77%** branch coverage
- ✅ **75%** function coverage
- ✅ **All tests passing**

📖 More: [SUMMARY.md](./SUMMARY.md#test-coverage)

## 🛠️ Troubleshooting Quick Links

| Problem | Solution |
|---------|----------|
| Cannot find module | [README.md](./README.md#problem-cannot-find-module-aws-acceleratorinstaller) |
| Test timeout | [README.md](./README.md#problem-tests-timeout-after-120-seconds) |
| Snapshot instability | [README.md](./README.md#problem-snapshots-change-on-every-run) |
| Coverage too low | [README.md](./README.md#problem-coverage-below-threshold) |

## 🎓 Learning Path

### Beginner
1. Read [TESTING.md](../TESTING.md) - Understand basics
2. Run `yarn test:unit` - See tests in action
3. Review a snapshot - Understand output
4. Read [README.md](./README.md) - Learn details

### Intermediate
1. Read [CONTRIBUTING.md](./CONTRIBUTING.md) - Learn to contribute
2. Add a simple test - Practice
3. Update a snapshot - Understand workflow
4. Review test code - Learn patterns

### Advanced
1. Modify `snapshot-test.ts` - Add serializers
2. Optimize test performance - Improve speed
3. Add complex scenarios - Edge cases
4. Update documentation - Share knowledge

## 📞 Getting Help

1. **Check documentation** - Start with [TESTING.md](../TESTING.md)
2. **Search this index** - Find relevant section
3. **Review examples** - Look at existing tests
4. **Ask the team** - Development channel

## 🔄 Maintenance

### Regular Updates
- Review snapshots when stack changes
- Add tests for new features
- Update documentation as needed
- Monitor coverage metrics

### When to Update Docs
- New test patterns emerge
- Common issues identified
- Best practices evolve
- Team feedback received

## ✨ Quick Reference Card

```bash
# Essential Commands
yarn test:unit              # Run all tests
yarn test:unit -u           # Update snapshots
yarn test:unit --coverage   # With coverage
yarn test:unit --watch      # Watch mode

# Essential Files
TESTING.md                  # Quick start
test/README.md              # Full guide
test/CONTRIBUTING.md        # How to contribute
test/snapshot-test.ts       # Test utility
test/installer-container-stack.test.ts  # Tests

# Essential Concepts
- Snapshot testing captures CloudFormation templates
- Serializers normalize dynamic values
- Always review diffs before updating
- Tests validate infrastructure, not implementation
```

---

**Need help?** Start with [TESTING.md](../TESTING.md) or ask the team!
