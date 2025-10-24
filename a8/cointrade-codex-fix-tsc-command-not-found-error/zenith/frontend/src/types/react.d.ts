declare module 'react' {
  export type ReactNode = any;
  export type FC<P = {}> = (props: P & { children?: ReactNode; key?: any }) => ReactNode | null;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useCallback<T extends (...args: any[]) => any>(factory: T, deps: any[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export const Fragment: unique symbol;
  export class StrictMode {
    props: { children?: ReactNode };
  }
  export interface HTMLAttributes<T> {
    [key: string]: any;
  }
  export interface DetailedHTMLProps<E, T> extends E {}
}

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(children: any): void;
  };
}

declare module 'clsx' {
  export default function clsx(...values: any[]): string;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
