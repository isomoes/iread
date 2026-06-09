// Re-export so `./components/ToastViewport` resolves. The canonical implementation
// (Toast + ToastViewport) lives in Toast.tsx per DESIGN Section 4.
export { ToastViewport, Toast } from './Toast';
export type { ToastItem, ToastKind, ToastActionShape } from './Toast';
