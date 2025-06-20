
import React, { useCallback } from 'react';

interface FileUploadProps {
  id: string;
  label: string;
  onFileContent: (content: string) => void;
  acceptedFormat?: string; // e.g. ".txt,.csv"
  helpText?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ id, label, onFileContent, acceptedFormat = ".csv", helpText }) => {
  
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        onFileContent(text);
      };
      reader.readAsText(file);
    } else {
      onFileContent(""); // Clear content if no file is selected or deselected
    }
  }, [onFileContent]);

  return (
    <div className="mb-6">
      <label htmlFor={id} className="block mb-2 text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type="file"
        id={id}
        accept={acceptedFormat}
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5"
      />
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
};

export default FileUpload;
