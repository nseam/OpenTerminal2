import type { AppLocalState } from "./api/data/AppLocalState";
import type { AppRoamingState } from "./api/data/AppRoamingState";
import type { AppStaticSettings } from "./api/data/AppStaticSettings";

declare module "vue" {
    interface ComponentCustomProperties {
        $roamingState: typeof AppRoamingState;
        $localState: typeof AppLocalState;
        $settings: typeof AppStaticSettings;
    }
}

export {};