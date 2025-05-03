/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_MODE: string
    readonly VITE_DEV_PATH: string
    readonly VITE_PROD_PATH: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
