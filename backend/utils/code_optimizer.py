import re

class CodeOptimizerService:
    def __init__(self):
        # Group 1: C-Style (Java, JS, C#, C++, TS, Swift, Kotlin, Go, Rust, PHP)
        self.c_style_langs = {'javascript', 'java', 'cpp', 'c', 'csharp', 'c#', 'typescript', 'ts', 'go', 'rust', 'kotlin', 'swift', 'php', 'dart'}
        
        # Group 2: Python-Style (Python, Ruby, Perl, Shell, YAML)
        self.py_style_langs = {'python', 'ruby', 'perl', 'bash', 'shell', 'yaml', 'yml'}
        
        # Group 3: SQL-Style (SQL, Lua, Haskell)
        self.sql_style_langs = {'sql', 'lua', 'haskell'}

        # Group 4: Markup (HTML, XML)
        self.markup_langs = {'html', 'xml'}

    def optimize_code(self, code, language="python"):
        """
        Main entry point.
        1. Identifies language family.
        2. Strips comments (preserving strings).
        3. Strips logging statements (optional but recommended).
        4. Normalizes whitespace.
        """
        lang = language.lower()
        cleaned_code = code

        # 1. Remove Comments based on language family
        if lang in self.c_style_langs:
            cleaned_code = self._remove_c_style_comments(cleaned_code)
            cleaned_code = self._remove_c_style_logs(cleaned_code)
        elif lang in self.py_style_langs:
            cleaned_code = self._remove_py_style_comments(cleaned_code)
            cleaned_code = self._remove_py_style_logs(cleaned_code)
        elif lang in self.sql_style_langs:
            cleaned_code = self._remove_sql_style_comments(cleaned_code)
        elif lang in self.markup_langs:
            cleaned_code = self._remove_markup_comments(cleaned_code)

        # 2. Universal Whitespace Cleanup
        # Remove empty lines containing only whitespace
        cleaned_code = re.sub(r'^\s*$', '', cleaned_code, flags=re.MULTILINE)
        # Collapse 3+ newlines into 2 (keeps logical separation but removes massive gaps)
        cleaned_code = re.sub(r'\n{3,}', '\n\n', cleaned_code)
        
        return cleaned_code.strip()

    def _remove_c_style_comments(self, text):
        # Regex explanation:
        # Group 1 (Quotes): Capture strings ("..." or '...') so we can SKIP them
        # Group 2 (Comments): Capture //... or /*...*/ so we can DELETE them
        pattern = r'("[^"\\]*(?:\\.[^"\\]*)*"|\'[^\'\\]*(?:\\.[^\'\\]*)*\')|(/\*[^*]*\*+(?:[^/*][^*]*\*+)*/|//[^\n]*)'
        
        def replacer(match):
            # If it matched Group 1 (String), return it as is.
            if match.group(1):
                return match.group(1)
            # If it matched Group 2 (Comment), return empty string.
            return ""
            
        return re.sub(pattern, replacer, text, flags=re.MULTILINE|re.DOTALL)

    def _remove_py_style_comments(self, text):
        # Captures strings (double/single/triple) to skip, captures # comments to delete
        pattern = r'("""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'|"[^"\\]*(?:\\.[^"\\]*)*"|\'[^\'\\]*(?:\\.[^\'\\]*)*\')|(#.*)'
        
        def replacer(match):
            if match.group(1): return match.group(1)
            return ""
            
        return re.sub(pattern, replacer, text)

    def _remove_sql_style_comments(self, text):
        # Handles -- comments
        pattern = r'("[^"\\]*(?:\\.[^"\\]*)*"|\'[^\'\\]*(?:\\.[^\'\\]*)*\')|(--.*)'
        def replacer(match):
            if match.group(1): return match.group(1)
            return ""
        return re.sub(pattern, replacer, text)

    def _remove_markup_comments(self, text):
        # Handles <!-- -->
        return re.sub(r'<!--[\s\S]*?-->', '', text)

    # --- Noise Reduction (Logging) ---
    def _remove_c_style_logs(self, text):
        # Removes console.log(...); or System.out.println(...);
        # This is a naive heuristic but effective for 90% of cases
        # It looks for `console.log` followed by balanced parentheses (roughly)
        patterns = [
            r'console\.(log|debug|info|warn|error)\s*\(.*?\);?',
            r'System\.out\.print(ln)?\s*\(.*?\);?'
        ]
        for p in patterns:
            text = re.sub(p, '', text)
        return text

    def _remove_py_style_logs(self, text):
        # Removes print(...)
        # Note: This might remove print statements user *wants* if it's a CLI tool, 
        # but for unit testing, prints are usually noise.
        return re.sub(r'print\s*\(.*?\)', '', text)