export interface Segment {
  kind: 'text' | 'version' | 'code' | 'dest';
  value: string;
}
