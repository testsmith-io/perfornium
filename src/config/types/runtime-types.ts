// Your existing VUContext remains unchanged for backward compatibility
export interface VUContext {
  vu_id: number;
  iteration: number;
  variables: Record<string, any>;
  extracted_data: Record<string, any>;
}