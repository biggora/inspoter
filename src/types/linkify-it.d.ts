declare module "linkify-it" {
  export default class LinkifyIt {
    match(text: string): Array<{
      index: number;
      lastIndex: number;
      text: string;
      url: string;
    }> | null;
  }
}
