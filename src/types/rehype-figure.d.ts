declare module "@microflash/rehype-figure" {
  import type { Plugin } from "unified";
  import type { Root } from "hast";

  interface RehypeFigureOptions {
    className?: string;
  }

  const rehypeFigure: Plugin<[RehypeFigureOptions?], Root>;
  export default rehypeFigure;
}
