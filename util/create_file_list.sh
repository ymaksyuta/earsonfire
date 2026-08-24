#!/usr/bin/env bash

# Check if at least the root directory argument is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <root_dir> [ignore_mask1] [ignore_mask2] ..."
    echo "Example: $0 ./my_project '*.git*' '*node_modules*' '*.log'"
    exit 1
fi

# Get the absolute path of the root directory to ensure find works reliably
ROOT_DIR=$(cd "$1" && pwd)
shift # Remove root_dir from arguments, leaving only the ignore masks

# Initialize the find command array
CMD=("find" "$ROOT_DIR")

# If ignore masks are provided, build the exclusion logic dynamically
if [ $# -gt 0 ]; then
    CMD+=("\(")
    FIRST=true
    for mask in "$@"; do
        if [ "$FIRST" = true ]; then
            CMD+=("-name" "$mask")
            FIRST=false
        else
            CMD+=("-o" "-name" "$mask")
        fi
    done
    # -prune skips matching directories/files, -print outputs the rest
    CMD+=("\)" "-prune" "-o" "-type" "f" "-print")
else
    # If no masks are provided, just find and print all files
    CMD+=("-type" "f" "-print")
fi

# Execute the find command and convert absolute paths to relative paths
# by removing the "${ROOT_DIR}/" prefix from the beginning of each line
eval "${CMD[@]}" | sed "s|^${ROOT_DIR}/||"
