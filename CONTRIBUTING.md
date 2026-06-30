# Contributing to cessor

Thank you for your interest in contributing to **cessor**! 🎉

We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code contributions.

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please be kind and constructive in all interactions.

---

## How to Contribute

### 1. Reporting Bugs

If you find a bug, please [open an issue](https://github.com/yourusername/cessor/issues) and include:

- A clear and descriptive title
- Steps to reproduce the behavior
- Expected behavior
- Your environment (Node.js version, OS, etc.)
- Code snippets or minimal reproduction (if possible)

### 2. Suggesting Features

We love new ideas! Before implementing a large feature, please open an issue first to discuss it.

### 3. Working on Issues

- Look for issues labeled [`good first issue`](https://github.com/yourusername/cessor/labels/good%20first%20issue) if you're new.
- Comment on the issue to let others know you're working on it.

---

## Development Setup

### Prerequisites

- Node.js >= 18
- Redis (for local testing)
- pnpm (recommended) or npm

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/cessor.git
cd cessor

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Available Script

Command,Description
npm run build,Build the library
npm test,Run tests with Vitest
npm run test:watch,Run tests in watch mode
npm run dev,Build in watch mode
npm run changeset,Create a changeset for versioning

### Pull Request Process

1. Fork the repository and create your branch from main:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and ensure tests pass:

   ```bash
   pnpm test
   ```

3. Add a changeset (important for versioning):

   ```bash
   pnpm run changeset
   ```

4. Commit your changes using clear commit messages.

5. Push to your fork and open a Pull Request.

6. Make sure your PR:
   - Passes all CI checks
   - Includes tests (when applicable)
   - Updates documentation if needed

### Commit & Changeset Guidelines

We use Changesets to manage versioning.

- Use clear, descriptive commit messages.
- When making changes that affect users, always create a changeset.
- We follow [Conventional Commits](www.conventionalcommits.org) style when possible.

### Questions?

Feel free to open an issue with the question label.

Happy Coding! 🚀
MIT © Kehinde Babalola
