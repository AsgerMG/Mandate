declare module "react-simple-maps" {
  import * as React from "react";

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface ZoomableGroupProps {
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    children?: React.ReactNode;
  }

  export interface GeographyFeature {
    rsmKey: string;
    id?: string | number;
    properties: Record<string, unknown>;
    type: string;
    geometry: unknown;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: GeographyFeature[] }) => React.ReactNode;
    parseGeographies?: (features: GeographyFeature[]) => GeographyFeature[];
  }

  export interface GeographyStyleSpec {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    outline?: string;
    cursor?: string;
  }

  export interface GeographyProps {
    geography: GeographyFeature;
    style?: {
      default?: GeographyStyleSpec;
      hover?: GeographyStyleSpec;
      pressed?: GeographyStyleSpec;
    };
    onMouseEnter?: React.MouseEventHandler<SVGPathElement>;
    onMouseMove?: React.MouseEventHandler<SVGPathElement>;
    onMouseLeave?: React.MouseEventHandler<SVGPathElement>;
    onClick?: React.MouseEventHandler<SVGPathElement>;
    className?: string;
  }

  export const ComposableMap: React.FC<ComposableMapProps>;
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;
  export const Geographies: React.FC<GeographiesProps>;
  export const Geography: React.FC<GeographyProps>;
}

declare module "d3-geo" {
  // Minimal shim for the geoMercator function we use to project marker
  // lat/lon onto the same SVG coordinate space as the ComposableMap.
  export interface GeoProjection {
    (point: [number, number]): [number, number] | null;
    center(c: [number, number]): GeoProjection;
    scale(s: number): GeoProjection;
    translate(t: [number, number]): GeoProjection;
  }
  export function geoMercator(): GeoProjection;
}
