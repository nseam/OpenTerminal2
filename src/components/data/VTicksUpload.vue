<!-- TEMPLATE -->

<template>

    <div class="ticks-upload flex flex-col flex-0 border border-gray-800 rounded-lg">

        <div class="ticks-upload-form flex flex-col p-2">

            <div class="attribute">
                <div class="attribute-label">Folder name</div>
                <div class="attribute-value">
                    <ElInput v-model="folderName" placeholder="e.g. Forex" clearable :disabled="uploading" />
                </div>
            </div>

            <div class="attribute">
                <div class="attribute-label">Symbol name</div>
                <div class="attribute-value">
                    <ElInput v-model="symbolName" placeholder="e.g. EURUSD" clearable :disabled="uploading" />
                </div>
            </div>

            <div class="attribute">
                <div class="attribute-label">Tick files</div>
                <div class="attribute-value">
                    <ElUpload
                        v-model:file-list="fileList"
                        class="ticks-upload-files flex-1"
                        action="#"
                        accept=".csv"
                        multiple
                        :auto-upload="false"
                        :disabled="uploading"
                    >
                        <ElButton :disabled="uploading">Select files</ElButton>
                    </ElUpload>
                </div>
            </div>

            <div class="attribute">
                <div class="attribute-label">Target path</div>
                <div class="attribute-value">
                    <ElInput 
                        v-model="targetPath"
                        placeholder="Target path"
                        clearable
                        disabled
                    />
                </div>
            </div>

            <div class="border-b border-gray-800 my-2" />

            <div class="ticks-upload-actions flex flex-row items-center mt-2">
                <span class="ticks-upload-status flex-1" :title="statusText">{{ statusText }}</span>
                <ElButton style="width: calc(50% - 6px)" type="primary" :loading="uploading" :disabled="!canUpload" @click="upload">Upload</ElButton>
            </div>

        </div>

        <Teleport to="body">
            <div v-if="progressVisible" class="ticks-upload-progress">
                <div class="ticks-upload-progress-bar" :style="{ width: `${progress}%` }"></div>
                <div class="ticks-upload-progress-label">{{ Math.round(progress) }}%</div>
            </div>
        </Teleport>

    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

    import { ElButton, ElInput, ElMessage, ElUpload, type UploadRawFile, type UploadUserFile } from 'element-plus';
    import { opfs } from '@shared/api/OPFS';
    import { InvalidPath, Throwable } from '@shared/api/Throwables';

    /** Root folder of the tick data inside the OPFS. */
    const TICKS_ROOT = 'ticks';

    /** How long the finished progress bar stays visible, in milliseconds. */
    const PROGRESS_HIDE_DELAY = 700;

    @Component({
        components: {
            ElButton,
            ElInput,
            ElUpload
        },
        emits: ['uploaded']
    })
    export class VTicksUpload extends Vue
    {
        /** Name of the sub folder under `ticks` the files are stored in. */
        public folderName: string = '';

        /** Symbol the uploaded ticks belong to, e.g. `EURUSD`. */
        public symbolName: string = '';

        /** Files attached by the user. They are only stored once Upload is clicked. */
        public fileList: UploadUserFile[] = [];

        /** Whether an upload is currently in progress. */
        public uploading: boolean = false;

        /** Upload progress in percent, from 0 to 100. */
        public progress: number = 0;

        /** Whether the fixed progress bar at the top of the page is shown. */
        public progressVisible: boolean = false;

        /** Human readable description of what is happening, shown next to the button. */
        public statusText: string = '';

        /** Timer that hides the progress bar once the upload is done. */
        private progressHideTimer: ReturnType<typeof setTimeout> | null = null;

        /** Path the files will be stored under, e.g. `ticks/Forex/EURUSD`. */
        public get targetPath(): string {
            const folder = this.folderName.trim() || '…';
            const symbol = this.symbolName.trim() || '…';

            return `${TICKS_ROOT}/${folder}/${symbol}`;
        }

        /** Whether the Upload button can be used. */
        public get canUpload(): boolean {
            return !this.uploading
                && this.folderName.trim() !== ''
                && this.symbolName.trim() !== ''
                && this.fileList.length > 0;
        }

        /**
         * Stores all attached files in the OPFS under `ticks/<folder>/<symbol>/`.
         *
         * The progress bar is driven by the number of bytes already written, so it advances
         * proportionally to the size of the attached files.
         */
        public async upload(): Promise<void> {
            if (this.uploading)
                return;

            let folder: string;
            let symbol: string;

            try {
                folder = this.validateSegment(this.folderName, 'Folder name');
                symbol = this.validateSegment(this.symbolName, 'Symbol name');
            }
            catch (error) {
                this.reportError(error);
                return;
            }

            const files = this.fileList
                .map(entry => entry.raw)
                .filter((raw): raw is UploadRawFile => raw !== undefined);

            if (files.length === 0) {
                ElMessage.warning('Attach at least one file to upload.');

                return;
            }

            const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

            this.uploading = true;
            this.progress = 0;
            this.progressVisible = true;
            this.statusText = '';

            this.cancelProgressHide();

            let completedBytes = 0;
            let uploadedCount = 0;

            try {
                for (const file of files) {
                    const path = `${TICKS_ROOT}/${folder}/${symbol}/${file.name}`;

                    this.statusText = `Uploading ${file.name}…`;

                    // Reading the raw bytes keeps the stored file byte-for-byte identical to the
                    // attached one, regardless of its encoding.
                    await opfs.storeFile(path, await file.arrayBuffer());

                    completedBytes += file.size;
                    uploadedCount++;

                    this.progress = totalBytes > 0
                        ? (completedBytes / totalBytes) * 100
                        : (uploadedCount / files.length) * 100;
                }

                this.progress = 100;
                this.statusText = `Uploaded ${uploadedCount} file${uploadedCount === 1 ? '' : 's'} to ${this.targetPath}`;

                ElMessage.success(this.statusText);

                this.fileList = [];

                this.$emit('uploaded', { folder, symbol, count: uploadedCount });
            }
            catch (error) {
                this.statusText = '';
                this.reportError(error);
            }
            finally {
                this.uploading = false;

                this.progressHideTimer = setTimeout(() => {
                    this.progressHideTimer = null;
                    this.progressVisible = false;
                }, PROGRESS_HIDE_DELAY);
            }
        }

        /**
         * Validates a single path segment typed by the user.
         *
         * @throws {InvalidPath} When the value is empty or would change the target path.
         */
        private validateSegment(value: string, label: string): string {
            const trimmed = value.trim();

            if (trimmed === '') {
                throw new InvalidPath({ message: `${label} must not be empty`, scope: 'VTicksUpload.upload' });
            }

            if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
                throw new InvalidPath({
                    message: `${label} "${value}" must not contain path separators`,
                    scope: 'VTicksUpload.upload'
                });
            }

            return trimmed;
        }

        /** Cancels a pending hide of the progress bar, e.g. when a new upload starts. */
        private cancelProgressHide(): void {
            if (this.progressHideTimer === null)
                return;

            clearTimeout(this.progressHideTimer);
            this.progressHideTimer = null;
        }

        private describeError(error: unknown): string {
            if (error instanceof Throwable)
                return error.scope ? `${error.message} (${error.scope})` : error.message;

            return error instanceof Error ? error.message : String(error);
        }

        private reportError(error: unknown): void {
            const message = this.describeError(error);

            console.error(message, error);
            ElMessage.error(message);
        }

        public unmounted(): void {
            this.cancelProgressHide();
        }
    }

    export default toNative(VTicksUpload);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

    @use "tailwindcss";

    .ticks-upload {
        border-radius: 6px;
        background-color: #0d0d0d;
    }

    .ticks-upload-toolbar {
        @apply border-b border-gray-800;
        gap: 8px;
    }

    .ticks-upload-title {
        font-weight: 700;
        color: #bbb;
    }

    .ticks-upload-target {
        color: #6cb6ff;
        text-align: right;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .ticks-upload-status {
        color: #888;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .ticks-upload-progress {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 10px;
        z-index: 3000;
        background-color: rgba(255, 255, 255, 0.08);
        overflow: hidden;
        pointer-events: none;
    }

    .ticks-upload-progress-bar {
        position: relative;
        height: 100%;
        background: linear-gradient(90deg, #2e7d32, #4caf50);
        transition: width 0.25s ease;
        overflow: hidden;

        // Moving highlight so the bar keeps animating even while a single large file is written.
        &::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
            animation: ticks-upload-shimmer 1.1s linear infinite;
        }
    }

    .ticks-upload-progress-label {
        position: absolute;
        top: 0;
        right: 6px;
        height: 10px;
        line-height: 10px;
        font-size: 9px;
        color: #fff;
        text-shadow: 0 0 2px #000;
    }

    @keyframes ticks-upload-shimmer {
        from {
            transform: translateX(-100%);
        }

        to {
            transform: translateX(100%);
        }
    }

</style>

<style lang="scss">

    @use "tailwindcss";

    .el-upload-list {
        margin: 0;
    }

    .el-upload-list > li:first-child {
        @apply mt-2;
    }

</style>
