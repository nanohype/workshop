'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface TemplateVariable {
  name: string;
  type: 'string' | 'bool' | 'enum' | 'int';
  placeholder: string;
  description: string;
  prompt?: string;
  default?: string | boolean | number;
  required?: boolean;
  validation?: { pattern?: string; message?: string };
  options?: string[];
}

interface VariableFormProps {
  variables: TemplateVariable[];
  values: Record<string, string | boolean | number>;
  onChange: (values: Record<string, string | boolean | number>) => void;
}

export function VariableForm({ variables, values, onChange }: VariableFormProps) {
  const update = (name: string, value: string | boolean | number) => {
    onChange({ ...values, [name]: value });
  };

  return (
    <div className="space-y-3">
      {variables.map(v => (
        <div key={v.name} className="space-y-1">
          <Label className="text-xs">
            {v.prompt || v.name}
            {v.required && <span className="text-rose-400 ml-1">*</span>}
          </Label>

          {v.type === 'bool' ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={values[v.name] === true || values[v.name] === 'true'}
                onCheckedChange={(checked) => update(v.name, checked)}
              />
              <span className="text-xs text-dim">{v.description}</span>
            </div>
          ) : v.type === 'enum' && v.options ? (
            <Select
              value={String(values[v.name] ?? v.default ?? '')}
              onValueChange={(val) => update(v.name, val)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder={`Select ${v.name}`} />
              </SelectTrigger>
              <SelectContent>
                {v.options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : v.type === 'int' ? (
            <Input
              type="number"
              value={String(values[v.name] ?? v.default ?? '')}
              onChange={(e) => update(v.name, parseInt(e.target.value) || 0)}
              className="text-xs"
            />
          ) : (
            <Input
              value={String(values[v.name] ?? v.default ?? '')}
              onChange={(e) => update(v.name, e.target.value)}
              placeholder={v.description}
              className="text-xs font-mono"
            />
          )}

          {v.type !== 'bool' && (
            <p className="text-[10px] text-dim">{v.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
