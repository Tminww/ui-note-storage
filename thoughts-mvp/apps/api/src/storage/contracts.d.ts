/** Shape implemented by storage adapters. The HTTP and AI layers depend on this contract. */
export type Category = 'idea' | 'task' | 'bug' | 'research' | 'note';
export type ThoughtStatus = 'pending' | 'processing' | 'ready' | 'needs_review';
export interface Project {
  id:string; name:string; description:string; color:string;
  createdAt:string; updatedAt:string; thoughtCount?:number;
}
export interface Thought {
  id:string; rawText:string; title:string; summary:string; tags:string[];
  projectId:string|null; projectLocked:boolean; category:Category;
  status:ThoughtStatus; confidence:number|null; errorMessage:string|null;
  generatorModel:string|null; decisionModel:string|null;
  createdAt:string; updatedAt:string;
}
export interface Settings {
  generatorProvider:string;generatorModel:string;decisionProvider:string;
  decisionModel:string;confidenceThreshold:number;
}
export interface StorageAdapter {
  listProjects():Project[];
  getProject(id:string):Project|null;
  createProject(input:{name:string;description?:string;color?:string}):Project;
  updateProject(id:string,patch:Partial<Project>):Project|null;
  deleteProject(id:string):boolean;
  listThoughts(filter?:{q?:string;projectId?:string;status?:string;category?:string}):Thought[];
  getThought(id:string):Thought|null;
  createThought(input:{rawText:string;projectId?:string|null}):Thought;
  updateThought(id:string,patch:Partial<Thought>):Thought|null;
  deleteThought(id:string):boolean;
  getSettings():Settings;
  updateSettings(patch:Partial<Settings>):Settings;
  exportSnapshot():{format:string;exportedAt:string;projects:Project[];thoughts:Thought[];settings:Settings};
  close():void;
}
