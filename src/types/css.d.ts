// Type declarations for the CSS files imported through esbuild's text loader.
// build.mjs sets loader '.css': 'text', so every CSS import evaluates to a string.
declare module '*.css' {
  const css: string
  export default css
}
