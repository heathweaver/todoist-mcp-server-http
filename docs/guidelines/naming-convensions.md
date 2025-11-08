# Naming Conventions

## DevOps Naming Convention – Manual

### Summary 🔑

Standardizing naming of branches in GitLab for simplified collaboration and
workflow.

Please add comments or suggest changes for anything that is not clear to you.

## Main GitLab Branches

We have three main or regular branches that will be available in the repository
on a permanent basis. The naming convention for the branches is simple:

- **`main`** - This is the master branch. It is the default branch and should be
  stable at all times. You can only merge to it after code testing, review, and
  approval.

- **`development`** - This is the main development branch. This branch is used
  to make changes and restricts developers from making any changes in the master
  branch directly. Changes in the development branch undergo reviews and, after
  testing, get merged with the master branch.

- **`dev-test`** - This is the test branch. It contains all the code for QA
  testing of all changes implemented. Before any change goes to the production
  environment, it must undergo QA testing to get a stable codebase.

## Temporary GitLab Branches

Temporary branches can be created and deleted when needed. They can be grouped
into a few categories:

- **Bug Fix Branches**
- **Feature Branches**
- **Experimental Branches**
- **WIP Branches**

## Naming the Branches

### Start branch name with a Group word

- **`bug`** - The bug which needs to be fixed soon
- **`wip`** - The work is in progress, and will not finish soon
- **`feature`** - This is the feature branch, introducing/enabling a new feature
- **`experiment`** - Used for experimenting and testing logic

By looking at the branch name, you can understand what this Git branch is about
and its purpose.

### Examples

- **`bug-logo-alignment-issue`** - The developer is trying to fix the logo
  alignment issue
- **`wip-ioc-container-added`** - The branch relates to the task to add an IoC
  container in progress

### Use unique ID in branch names

Use the issue tracker ID in the branch name. For instance:

- **`wip-8712-add-testing-module`**
  - `8712` - is the issue number

By looking at the branch name, you can understand what this Git branch is about
and its purpose.

### Use hyphen as a separator

- **`wip55addtestingmodule`** - ❌ Wrong
- **`wip_55_add_testing_module`** - ❌ Wrong
- **`wip-55-add-testing-module`** - ✅ Correct
- **`feature-28-show-button-task-pane`** - ✅ Correct

## Git Branch Workflow

Here is a simple workflow of Git branches:

```
feature branch → development → dev-test → main
     ↓              ↓           ↓        ↓
  Feature      Development   Testing   Production
  Work         Integration   QA        Release
```

## Change Log

- **Initial version** (Date: 02/01/2021)
- **Change 2** (Date: MM/DD/YYYY)

of
