#!/bin/bash

# Simple monitor script that uses Claude Code CLI to update visualization
# Usage: ./monitor.sh [refresh_seconds]

REFRESH_INTERVAL=${1:-3}
VISUALIZATION_FILE="cc-diff-page/visualisation.html"

echo "🚀 Starting git diff monitor..."
echo "📊 Visualization file: $VISUALIZATION_FILE"
echo "⏱️  Refresh interval: ${REFRESH_INTERVAL}s"
echo "🛑 Press Ctrl+C to stop"
echo ""

while true; do
    # Get current timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Get git diff, excluding the visualization file itself
    DIFF=$(git diff -- . ":!${VISUALIZATION_FILE}" 2>/dev/null)

    if [ ! -z "$DIFF" ]; then
        echo "[$TIMESTAMP] 🔍 Changes detected, updating visualization..."

        # Count some basic stats
        FILES_CHANGED=$(git diff --name-only -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | wc -l | tr -d ' ')
        ADDITIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
        DELETIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

        echo "  📁 Files: $FILES_CHANGED | ➕ +$ADDITIONS | ➖ -$DELETIONS"

        # Create the prompt for Claude
        PROMPT="You are updating an HTML visualization of git changes. Here is the current git diff:

\`\`\`diff
$DIFF
\`\`\`

Please update the file at $VISUALIZATION_FILE by:
1. Replacing the title placeholder with a meaningful description of these changes
2. Filling in the commit stats (files: $FILES_CHANGED, additions: +$ADDITIONS, deletions: -$DELETIONS)
3. Creating business value cards that explain what these changes accomplish
4. Organizing file changes into logical categories
5. Including the actual diff content in the code-diff sections
6. Making the visualization focus on business/user value, not just technical details

Keep the existing HTML structure and JavaScript intact. Only update the placeholder content and data."

        # Call Claude in headless mode
        claude -p "$PROMPT" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "  ✅ Visualization updated successfully!"
        else
            echo "  ⚠️  Warning: Claude command may have encountered an issue"
        fi
    else
        echo "[$TIMESTAMP] ⏳ No unstaged changes detected"
    fi

    # Wait before next check
    sleep $REFRESH_INTERVAL
done