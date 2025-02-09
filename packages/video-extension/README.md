# @jupyterlab/video-extension

A JupyterLab extension for rendering video files.

## Overview

This extension enables JupyterLab to display video files in supported formats (MP4, WebM, OGG) directly in the notebook or file browser. It provides a simple video player interface with standard controls for playback.

## Requirements

* JupyterLab >= 4.0.0

## Install

```bash
pip install jupyterlab
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the video_extension directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm run build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm run watch
# Run JupyterLab in another terminal
jupyter lab
```

### Uninstall

```bash
pip uninstall video_extension
```
