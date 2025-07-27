import { Settings } from "lucide-react";

interface ToolCallIndicatorProps {
  name: string;
  parameters: any;
}

export function ToolCallIndicator({ name, parameters }: ToolCallIndicatorProps) {
  return (
    <div className="bg-gray-100 rounded-lg p-3 text-sm">
      <div className="flex items-center space-x-2 text-gray-600 mb-2">
        <Settings className="h-3 w-3" />
        <span>Calling function: {name}</span>
      </div>
      <div className="font-mono text-xs text-gray-500 bg-white p-2 rounded">
        {JSON.stringify(parameters, null, 2)}
      </div>
    </div>
  );
}
