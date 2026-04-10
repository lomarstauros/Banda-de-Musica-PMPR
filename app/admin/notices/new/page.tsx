'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { db, app } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';

export default function AdminNewNoticePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(-1);
  const [formData, setFormData] = useState({
    title: '',
    type: 'geral',
    message: '',
    requireConfirmation: true
  });

  const handleSave = async () => {
    if (!formData.title || !formData.message) {
      alert('Por favor, preencha o título e a mensagem.');
      return;
    }

    setLoading(true);
    try {
      let fileData = null;
      if (file) {
        setUploadProgress(0);
        const storage = getStorage(app);
        const fileRef = ref(storage, `notices_files/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(Math.round(prog));
            }, 
            reject, 
            () => resolve(uploadTask.snapshot.ref)
          );
        });
        const downloadUrl = await getDownloadURL(fileRef);
        fileData = {
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: downloadUrl
        };
      }

      await addDoc(collection(db, 'notices'), {
        ...formData,
        file: fileData || null,
        createdAt: serverTimestamp(),
        author: 'Gestor' // Simplified for now
      });
      router.push('/admin/swaps');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notices');
    } finally {
      setLoading(false);
      setUploadProgress(-1);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 5 * 1024 * 1024) {
        alert('O arquivo selecionado é maior que 5MB. Escolha um arquivo menor.');
        return;
      }
      setFile(f);
    }
  };
  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Novo Aviso</h1>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Comunicar a Banda</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Envie comunicados, ordens de serviço ou avisos urgentes para os músicos.</p>
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Título do Aviso</span>
              <input 
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" 
                placeholder="Ex: Alteração de Uniforme"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Tipo de Aviso</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 cursor-pointer has-[:checked]:bg-primary/10 has-[:checked]:border-primary has-[:checked]:text-primary text-gray-500 font-bold text-xs transition-all">
                  <input 
                    className="sr-only" 
                    name="notice-type" 
                    type="radio" 
                    value="geral" 
                    checked={formData.type === 'geral'}
                    onChange={() => setFormData({...formData, type: 'geral'})}
                  />
                  <span className="material-symbols-outlined text-[18px]">info</span>
                  Geral
                </label>
                <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 cursor-pointer has-[:checked]:bg-red-500/10 has-[:checked]:border-red-500 has-[:checked]:text-red-500 text-gray-500 font-bold text-xs transition-all">
                  <input 
                    className="sr-only" 
                    name="notice-type" 
                    type="radio" 
                    value="urgente"
                    checked={formData.type === 'urgente'}
                    onChange={() => setFormData({...formData, type: 'urgente'})}
                  />
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Urgente
                </label>
              </div>
            </label>



            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Mensagem</span>
              <textarea 
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[150px]" 
                placeholder="Escreva o conteúdo do aviso aqui..."
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
              ></textarea>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Anexos (Opcional)</span>
              <label className="relative border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 transition-colors cursor-pointer overflow-hidden">
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileChange}
                  accept=".pdf,image/jpeg,image/png"
                  disabled={loading}
                />
                <span className={`material-symbols-outlined text-[32px] ${file ? 'text-primary' : 'text-gray-400'}`}>
                  {file ? 'task' : 'upload_file'}
                </span>
                <p className={`text-xs font-bold text-center ${file ? 'text-primary' : 'text-gray-500'}`}>
                  {file ? file.name : 'Clique para anexar arquivos (PDF, JPG)'}
                </p>
                <p className="text-[10px] text-gray-400">Tamanho máximo: 5MB</p>
                
                {uploadProgress >= 0 && (
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-200">
                    <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                )}
              </label>
              {file && !loading && (
                <button type="button" onClick={() => setFile(null)} className="text-xs font-bold text-red-500 hover:text-red-700 self-end">
                  Remover anexo
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10 mt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={formData.requireConfirmation}
                  onChange={(e) => setFormData({...formData, requireConfirmation: e.target.checked})}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-900 dark:text-white">Exigir Confirmação</span>
                <span className="text-[10px] text-gray-500">O músico deverá marcar &quot;Ciente&quot;</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="p-6 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={handleSave}
            disabled={loading}
            className="w-full h-14 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (uploadProgress >= 0 ? `Enviando arquivo (${uploadProgress}%)` : 'Publicando...') : 'Publicar Aviso'}
            {!loading && <span className="material-symbols-outlined text-[20px]">send</span>}
          </button>
        </footer>
      </div>
    </div>
  );
}
