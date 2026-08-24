#!/usr/bin/env bash

# Check for the minimum required arguments (export_dir and root_dir)
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <export_dir> <root_dir> [ignore_mask1] [ignore_mask2] ..."
    echo "Example: $0 ./flat_output ./my_project '*.git*' '*node_modules*'"
    exit 1
fi

# Resolve absolute path for the export directory and create it if it doesn't exist
EXPORT_DIR=$(mkdir -p "$1" && cd "$1" && pwd)

# Define the manifest file path inside the export directory
MANIFEST_FILE="$EXPORT_DIR/manifest.txt"
# Clear the manifest file if it already exists
> "$MANIFEST_FILE"

# Resolve absolute path for the root directory
ROOT_DIR=$(cd "$2" && pwd)

# Shift arguments twice to remove export_dir and root_dir, leaving only ignore masks
shift 2

# Initialize the find command array safely
CMD=("find" "$ROOT_DIR")

# Build the exclusion logic dynamically if ignore masks are provided
if [ $# -gt 0 ]; then
    CMD+=("(" )
    FIRST=true
    for mask in "$@"; do
        if [ "$FIRST" = true ]; then
            CMD+=("-name" "$mask")
            FIRST=false
        else
            CMD+=("-o" "-name" "$mask")
        fi
    done
    # -prune skips matching items, -print outputs the rest
    CMD+=(")" "-prune" "-o" "-type" "f" "-print")
else
    # Default to finding all files if no masks are specified
    CMD+=("-type" "f" "-print")
fi

# Execute find directly from the array using "${CMD[@]}" without eval.
# This prevents Bash from prematurely expanding wildcards like *
"${CMD[@]}" | while read -r ABS_PATH; do
    # Extract the relative path by removing the ROOT_DIR prefix
    REL_PATH="${ABS_PATH#$ROOT_DIR/}"
    
    # Extract the original filename and its extension
    BASE_NAME=$(basename "$ABS_PATH")
    FILENAME="${BASE_NAME%.*}"
    EXTENSION="${BASE_NAME##*.}"
    
    # Handle files without an extension
    if [ "$FILENAME" = "$EXTENSION" ]; then
        EXTENSION=""
    else
        EXTENSION=".$EXTENSION"
    fi
    
    # Generate the initial destination filename in the flat folder
    FINAL_NAME="$BASE_NAME"
    DEST_PATH="$EXPORT_DIR/$FINAL_NAME"
    
    # Collision handling: if a file with the same name exists, append a unique counter
    COUNTER=1
    while [ -e "$DEST_PATH" ]; do
        FINAL_NAME="${FILENAME}_${COUNTER}${EXTENSION}"
        DEST_PATH="$EXPORT_DIR/$FINAL_NAME"
        COUNTER=$((COUNTER + 1))
    done
    
    # Copy the file to the flat export directory
    cp -p "$ABS_PATH" "$DEST_PATH"
    
    # Write the mapping to the manifest file (Format: ExportedName -> OriginalRelativePath)
    echo "$FINAL_NAME -> $REL_PATH" >> "$MANIFEST_FILE"
    
    # Print progress to the console
    echo "Exported: $FINAL_NAME ($REL_PATH)"
done

echo "---"
echo "Export complete. Manifest saved to: $MANIFEST_FILE"
