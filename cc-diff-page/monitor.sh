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

    # Get git diff for tracked files, excluding the visualization file itself
    TRACKED_DIFF=$(git diff -- . ":!${VISUALIZATION_FILE}" 2>/dev/null)

    # Get untracked files (excluding the visualization file)
    UNTRACKED_FILES=$(git ls-files --others --exclude-standard | grep -v "^${VISUALIZATION_FILE}$" 2>/dev/null)

    # Combine both diffs - for untracked files, show them as new files
    DIFF=""
    if [ ! -z "$TRACKED_DIFF" ]; then
        DIFF="$TRACKED_DIFF"
    fi

    if [ ! -z "$UNTRACKED_FILES" ]; then
        # Add untracked files to the diff output
        while IFS= read -r file; do
            if [ ! -z "$DIFF" ]; then
                DIFF="$DIFF
"
            fi
            DIFF="${DIFF}diff --git a/$file b/$file
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/$file"
            # Add file contents with + prefix
            if [ -f "$file" ]; then
                while IFS= read -r line; do
                    DIFF="${DIFF}
+${line}"
                done < "$file"
            fi
        done <<< "$UNTRACKED_FILES"
    fi

    if [ ! -z "$DIFF" ]; then
        echo "[$TIMESTAMP] 🔍 Changes detected, updating visualization..."

        # Count stats for both tracked and untracked files
        TRACKED_FILES=$(git diff --name-only -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | wc -l | tr -d ' ')
        UNTRACKED_COUNT=$(echo "$UNTRACKED_FILES" | grep -c . 2>/dev/null || echo "0")
        FILES_CHANGED=$((TRACKED_FILES + UNTRACKED_COUNT))

        # Get additions/deletions from tracked files
        ADDITIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
        DELETIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

        # Count lines in untracked files as additions
        if [ ! -z "$UNTRACKED_FILES" ]; then
            UNTRACKED_LINES=0
            while IFS= read -r file; do
                if [ -f "$file" ]; then
                    FILE_LINES=$(wc -l < "$file" | tr -d ' ')
                    UNTRACKED_LINES=$((UNTRACKED_LINES + FILE_LINES))
                fi
            done <<< "$UNTRACKED_FILES"
            ADDITIONS=$((ADDITIONS + UNTRACKED_LINES))
        fi

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

        # Call Claude in headless mode with skip permissions flag
        claude --dangerously-skip-permissions -p "$PROMPT" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "  ✅ Visualization updated successfully!"
        else
            echo "  ⚠️  Warning: Claude command may have encountered an issue"
        fi
    else
        echo "[$TIMESTAMP] ⏳ No changes detected (tracked or untracked)"
    fi

    # Wait before next check
    sleep $REFRESH_INTERVAL
done