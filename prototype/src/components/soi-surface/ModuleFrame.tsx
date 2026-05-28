'use client';

/**
 * SOI Surface — Module Frame
 *
 * Wrapper for any module in a slot. Handles size rendering,
 * emphasis, edit mode affordances, and compact/normal/expanded states.
 */

import type { ModuleSize } from '@/lib/soi-surface/layout-state';

interface Props {
  moduleId: string;
  name: string;
  size: ModuleSize;
  emphasized?: boolean;
  editMode?: boolean;
  children: React.ReactNode;
}

export function ModuleFrame({ moduleId, name, size, emphasized, editMode, children }: Props) {
  const isCompact = size === 'compact';

  return (
    <div
      className={`sf-module ${size}${emphasized ? ' emphasized' : ''}${editMode ? ' editing' : ''}`}
      data-module={moduleId}
    >
      {/* Header */}
      <div className="sf-module-head">
        {editMode && <div className="sf-grip">⠿</div>}
        <div className="sf-module-label">{name}</div>
        {editMode && (
          <div className="sf-module-actions">
            <button className="sf-action" title="Collapse">{isCompact ? '▢' : '▬'}</button>
          </div>
        )}
      </div>

      {/* Body */}
      {!isCompact && <div className="sf-module-body">{children}</div>}
      {isCompact && <div className="sf-module-compact">{children}</div>}
    </div>
  );
}
