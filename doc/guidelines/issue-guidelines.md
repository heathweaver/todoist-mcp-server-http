# GitHub Issues Guidelines for Weaver Education

## Overview

Write small, focused issues for AI agents. Each issue covers one unit of
functionality—granular but not overly specific.

## Issue Structure Requirements

### **Avoid Broad Tasks**

- ❌ "Implement threaded forums"
- ✅ "Create post view UI for forums"
- ✅ "Add pinning post to community wall"

### **Required Fields**

1. **Brief Description**: Clear, concise explanation of what needs to be built
2. **Acceptance Criteria**: Specific, testable requirements for completion
3. **Dependencies**: What must be completed first (if any)
4. **Effort Estimate**: 1-5 points (1=easy, 5=complex)
5. **Labels**: Appropriate categorization (epic, theme, ai, classroom,
   community, infrastructure)

### **Naming Convention**

Follow the naming-conventions.md document:

- Use hyphens as separators
- Include issue ID when referencing other issues
- Use descriptive, action-oriented titles

### **Issue Independence**

- Each issue should be independently testable
- Avoid circular dependencies
- Ensure issues can be worked on in parallel when possible

### **Weaver Education Spec Alignment**

- All issues must tie back to the Weaver Education Platform Specification
- Reference specific features from the spec document
- Maintain consistency with the overall platform vision

## Example Issue Format

```markdown
## Title

[Component] Action Description

## Description

Brief explanation of what needs to be built

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Dependencies

- Issue #X (if applicable)
- None (if standalone)

## Effort Estimate

3 points

## Labels

theme, priority-p0
```

## Effort Point Scale

- **1 point**: Simple UI change, minor bug fix
- **2 points**: Basic component creation, simple integration
- **3 points**: Moderate complexity, multiple components
- **4 points**: Complex feature, significant backend work
- **5 points**: Major feature, architectural changes
