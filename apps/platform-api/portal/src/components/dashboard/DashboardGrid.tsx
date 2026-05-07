/**
 * @module DashboardGrid
 *
 * Renders the widget grid layout using dnd-kit for drag-and-drop reordering.
 * Each widget is wrapped in a `DashboardWidget` sortable container. Widgets
 * are looked up from `widgetRegistry` by type; a camelCase fallback is
 * attempted when the exact type string doesn't match (e.g. "AlertFeed" ->
 * "alertFeed") to handle registry key conventions.
 *
 * In edit mode, a subtle grid overlay is shown to help users visualize the
 * 12-column layout, and a `DragOverlay` ghost follows the cursor during drags.
 */
"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useDashboard, getWidgetDef, type WidgetConfig } from "./DashboardProvider";
import DashboardWidget from "./DashboardWidget";
import { widgetRegistry } from "./widgets";

export default function DashboardGrid() {
  const { currentLayout, reorderWidgets, isEditMode } = useDashboard();
  const [activeWidget, setActiveWidget] = useState<WidgetConfig | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const widget = currentLayout.find((w) => w.id === event.active.id);
    setActiveWidget(widget || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWidget(null);
    if (over && active.id !== over.id) {
      reorderWidgets(String(active.id), String(over.id));
    }
  };

  const sortedLayout = [...currentLayout].sort((a, b) => a.order - b.order);
  const ids = sortedLayout.map((w) => w.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className={`
            grid gap-4 lg:gap-5
            grid-cols-1 sm:grid-cols-6 lg:grid-cols-12
            transition-all duration-300
            ${isEditMode ? "relative" : ""}
          `}
        >
          {/* Edit mode grid overlay */}
          {isEditMode && (
            <div
              className="absolute inset-0 pointer-events-none rounded-lg opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
                `,
                backgroundSize: "calc(100% / 12) 60px",
              }}
            />
          )}

          {sortedLayout.map((widget) => {
            // Widget type matching: try exact key first, then camelCase fallback
            // to bridge PascalCase widget types with camelCase registry keys
            // Match widget type to registry (try exact, then camelCase)
            const key = widget.type in widgetRegistry
              ? widget.type
              : widget.type.charAt(0).toLowerCase() + widget.type.slice(1);
            const entry = widgetRegistry[key];
            const WidgetComponent = entry?.component;

            return (
              <DashboardWidget key={widget.id} widget={widget}>
                {WidgetComponent ? <WidgetComponent /> : null}
              </DashboardWidget>
            );
          })}

          {/* Empty state */}
          {sortedLayout.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <svg className="w-16 h-16 text-of-outline mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
              </svg>
              <p className="text-of-on-surface-variant text-sm mb-1">No widgets added</p>
              <p className="text-of-outline text-xs">Click &quot;Edit Layout&quot; and add widgets from the palette</p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Drag overlay — the "ghost" that follows the cursor */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
        {activeWidget ? (
          <div
            className="rounded-xl border border-of-primary/30 bg-of-surface-container-low/90 backdrop-blur-lg shadow-2xl shadow-black/40 opacity-90 scale-[1.03]"
            style={{ gridColumn: `span ${activeWidget.colSpan}`, width: "100%" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <span className="text-sm font-medium text-foreground">
                {getWidgetDef(activeWidget.type)?.name || activeWidget.type}
              </span>
            </div>
            <div className="p-4 min-h-[80px] flex items-center justify-center">
              <p className="text-xs text-of-outline">Moving...</p>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
