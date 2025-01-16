# Commit messages

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/) style. Commit messages should be concise and descriptive. Describe the intent of the change with as few words as possible.


**Structure of Commit Messages: *** *Type(Component): Description*

## Type

- `fix` - Fixes a bug
- `feat` - Adds a new feature
- `chore` - Covers administrative tasks, documentation updates, or changes that do not affect the code directly

## Component (in parentheses)
Specifies the part of the codebase effected. Examples include:
`module`, `guardduty`, `config`, `constructs`, `test`, `kms`, `sample-config`

## Description

Brief intent of the change

## Examples of Commit Message

The full message should look something like:

- Bug Fixes:
  - `fix(kms): fixed CWL CMK condition`
  - `fix(iam): prevents cdk execution role from assuming vpc trust policy`
- New Features:
  - `feat(orgs): allowing chatbot policies to be set in organization config`
- Chores and Maintenance:
  - `chore(sample-config): disable event bus policy sample config`
  - `chore(test): add audit manager integration testing gitlab ci job`
