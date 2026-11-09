declare module "*.css";
declare module "*.png" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
declare module "*.svg" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
