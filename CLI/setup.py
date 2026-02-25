#!/usr/bin/env python
"""
Setup script for GenAI-QA CLI
"""

from setuptools import setup, find_packages
import os

# Read README if it exists, otherwise use short description
try:
    readme_path = os.path.join(os.path.dirname(__file__), "README.md")
    with open(readme_path, "r", encoding="utf-8") as fh:
        long_description = fh.read()
except FileNotFoundError:
    long_description = "Command line interface for GenAI-QA testing platform. See DOCUMENTATION.md for complete reference."

setup(
    name="genai-qa-cli",
    version="0.1.0",
    author="GenAI QA Team",
    description="Command line interface for GenAI-QA testing platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/genai-qa",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    install_requires=[
        "click>=8.0.0",
        "requests>=2.28.0",
        "tabulate>=0.9.0",
        "python-dotenv>=0.21.0",
    ],
    py_modules=['genai_qa_cli', 'genai_qa_api'],
    entry_points={
        "console_scripts": [
            "genai-qa=genai_qa_cli:cli",
        ],
    },
)
