import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface LoadingImageProps {
  src?: string;
  alt: string;
  className?: string;
  isGenerating?: boolean;  // New prop to indicate image is being generated
}

export function LoadingImage({ src, alt, className, isGenerating = false }: LoadingImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // If no src and not generating, show placeholder
  if (!src && !isGenerating) {
    return (
      <div className={`flex flex-col items-center justify-center w-full h-full gap-3 bg-gray-100 text-gray-400 ${className}`}>
        <ImageIcon className="w-10 h-10" />
        <span className="text-sm">Generated artwork preview</span>
      </div>
    );
  }

  // If generating, show loading animation (regardless of src)
  if (isGenerating) {
    return (
      <div className="relative w-full h-full">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, #e5e7eb, #f3f4f6, #e5e7eb)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite linear',
          }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              {/* Animated pulse circles */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-pulse"></div>
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-white animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500">Generating image...</p>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  // If error loading image, show error state
  if (hasError) {
    return (
      <div className={`flex flex-col items-center justify-center w-full h-full gap-3 bg-gray-100 text-gray-400 ${className}`}>
        <ImageIcon className="w-10 h-10" />
        <span className="text-sm">Image failed to load</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Loading animation */}
      {isLoading && (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, #e5e7eb, #f3f4f6, #e5e7eb)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s infinite linear',
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                {/* Animated pulse circles */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
                  <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-pulse"></div>
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-500">Generating image...</p>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </>
      )}

      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-500`}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
}
