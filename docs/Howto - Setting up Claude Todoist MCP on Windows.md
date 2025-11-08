# Setting up Claude Todoist MCP on Windows

This guide covers setting up the Todoist Model Context Protocol (MCP) server on Windows devices to enable Claude to interact with your Todoist tasks, projects, and labels.

**There are two methods to set this up:**

1. Using the Smithery package manager (recommended for most users)
2. Manual setup (for development or advanced usage)

## Table of contents

* [Setting up Claude Todoist MCP on Windows](#setting-up-claude-todoist-mcp-on-windows)
  * [Table of contents](#table-of-contents)
  * [Requirements](#requirements)
  * [Installation Steps](#installation-steps)
    * [1. Install Claude Desktop App](#1-install-claude-desktop-app)
    * [2. Install Node.js](#2-install-nodejs)
    * [3. Get Your Todoist API Token](#3-get-your-todoist-api-token)
    * [4a. Easy Install with Smithery](#4a-easy-install-with-smithery)
    * [4b. Easy Install with npm](#4b-easy-install-with-npm)
    * [4c. Manual Install for Development *(Advanced)*](#4c-manual-install-for-development-advanced)
  * [Usage](#usage)
  * [Simple Troubleshooting](#simple-troubleshooting)
  * [Notes](#notes)

## Requirements

* Claude Desktop App
* Node.js installed on your Windows device
* A Todoist API token ([how to get one](https://todoist.com/help/articles/find-your-api-token-Jpzx9IIlB))
* Admin access to your Windows device
* Winget package manager (pre-installed on Windows 11; for Windows 10 or if missing, see [Microsoft's installation guide](https://learn.microsoft.com/en-us/windows/package-manager/winget/))

## Installation Steps

### 1. Install Claude Desktop App

From CMD as **admin**:

   ```bash
   winget install Anthropic.Claude  
   ```

Or download manually from [claude.ai/download](https://claude.ai/download)

### 2. Install Node.js

From CMD as **admin**:

   ``` bash
   winget install OpenJS.NodeJS
   ```

### 3. Get Your Todoist API Token

1. Log in to your Todoist account
2. Go to Settings → Integrations  
3. Find and Copy your API token under the "Developer" section

### 4a. Easy Install with Smithery

1. Open Command Prompt or PowerShell
2. Run the following command:

   ```bash
   npx -y @smithery/cli@latest install @Chrusic/todoist-mcp-server-extended --client claude
   ```

3. When prompted, paste in your Todoist API token from step 3.

That's it! Smithery will automatically install the MCP server and configure Claude to use it. Skip to the Usage section below.

### 4b. Easy Install with npm

1. Open Command Prompt or PowerShell
2. Run the following command:

   ``` bash
   npm install -g @chrusic/todoist-mcp-server-extended
   ```

3. Open Claude Desktop and Navigate to: `File -> Settings -> Developer -> "Edit Config"`. That will Open the folder with the claude_desktop_config.json file.

4. Open the `claude_desktop_config.json` with your favorite json editor and paste the following snippet. **Replace the `PASTE-YOUR-API-TOKEN-HERE` with the API token aquired from todoist earlier.**

   ``` json
   "todoist": {
     "command": "npx",
     "args": ["-y", "@chrusic/todoist-mcp-server-extended"],
     "env": {
         "TODOIST_API_TOKEN": "PASTE-YOUR-API-TOKEN-HERE"
     }
   }
   ```

5. When all put together, it should look something like this:

   ``` json
   {
     "mcpServers": {
         "todoist": {
         "command": "npx",
         "args": ["-y", "@chrusic/todoist-mcp-server-extended"],
         "env": {
             "TODOIST_API_TOKEN": "PASTE-YOUR-API-TOKEN-HERE"
         }
       }
     }
   }
   ```

6. Todoist MCP Server extended is now configured for use. Skip to the Usage section below!

### 4c. Manual Install for Development *(Advanced)*

1. Install Git from CMD as **admin**:

   ```bash
   winget install Git.Git
   ```

2. Clone and Set Up the Todoist MCP Server

   a. Open Command Prompt or PowerShell
   b. Navigate to your desired director for storing the todoist repo  *(Example: `cd C:/git/YourRepoFolder`)*
   c. Clone the repository:

      ```bash
      git clone https://github.com/Chrusic/todoist-mcp-server-extended.git
      cd todoist-mcp-server-extended
      ```

   d. Install dependencies:

      ```bash
      npm install
      ```

   e. Build the server:

      ```bash  
      npm run build
      ```

3. Configure Claude Desktop

   a. Open Claude Desktop and go to File → Settings (Ctrl+Comma)
   b. Navigate to the Developer Tab
   c. Click "Edit Config"
   d. Add the following to your config file:

   ```json
   {
     "mcpServers": {
       "todoist": {
         "command": "node",
         "args": [
           "C:\\path\\to\\todoist-mcp-server-extended\\dist\\index.js" 
         ],
         "env": {
           "TODOIST_API_TOKEN": "your_todoist_api_token"
         }
       }
     }
   }
   ```  

   e. Replace `"C:\\path\\to\\todoist-mcp-server-extended\\dist\\index.js"` with the actual path to the built index.js file
   f. Replace `"your_todoist_api_token"` with your Todoist API token copied in step 3.

## Usage

1. Restart Claude Desktop to apply the changes  
2. In a new chat, you can now ask Claude to perform Todoist operations like:
   * "Show me my overdue tasks"
   * "Create a new task called 'Review report' due tomorrow"
   * "Update my task 'Buy groceries' to high priority"
   * "Show all my projects"
   * "Create a new project called 'Home Renovation'"

## Simple Troubleshooting

If you encounter any issues:

1. Check that the path to the index.js file is correct and uses double backslashes in Windows paths
2. Ensure your Todoist API token is valid
3. Make sure you only have one entry for each MCP server in the claude_desktop_config.json
4. Look for error messages in the Claude Developer Console (View → Toggle Developer Tools)  
5. Make sure Node.js is properly installed by running `node --version` in Command Prompt

## Notes

* Multiple MCPs can be added under the `mcpServers` section - only add new server entries, not the entire JSON structure again
* Make sure to maintain proper JSON formatting when manually editing the config file
* Keep your Todoist API token secure and never share it with others!

That's it! Claude should now be able to interact with your Todoist account.

***Note: Guide written with the help of Claude :smirk:***
