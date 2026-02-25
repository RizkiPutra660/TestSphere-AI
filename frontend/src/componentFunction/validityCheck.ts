const validityCheck = (fileName: string, language: string) => {
    if(fileName.endsWith(".py") && language === "python") {
      return true
    } else if(fileName.endsWith(".js") && language === "javascript") {
      return true
    } else if(fileName.endsWith(".ts") && language === "typescript") {
      return true
    } else if(fileName.endsWith(".java") && language === "java") {
      return true
    } else {
      return false
    }
  }

  export default validityCheck