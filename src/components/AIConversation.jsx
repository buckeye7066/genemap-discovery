import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Heart, Play, Pause, RotateCcw, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const conversation = [
  {
    speaker: "robert",
    text: "Welcome to GeneMap. I'm Robert, your AI clinical decision support assistant.",
    voice: "Deep, authoritative tone",
    duration: 4000
  },
  {
    speaker: "anastasia",
    text: "And I'm Anastasia! I'm here to help you understand your genetic information with care and compassion.",
    voice: "Warm British accent",
    duration: 4000
  },
  {
    speaker: "robert",
    text: "GeneMap is a revolutionary platform that bridges the gap between phenotypes and genes. Let me show you what makes it special.",
    voice: "Commanding presence",
    duration: 5000
  },
  {
    speaker: "anastasia",
    text: "It all starts with a simple search. You can search by disease name like 'Type 2 Diabetes' or phenotype like 'polydactyly'.",
    voice: "Gentle explanation",
    duration: 5000
  },
  {
    speaker: "robert",
    text: "Our AI instantly analyzes comprehensive genomic databases - MyGene.info, Ensembl, HPO, GWAS Catalog, UniProt, and more.",
    voice: "Authoritative expertise",
    duration: 5000
  },
  {
    speaker: "anastasia",
    text: "Within seconds, you'll see candidate genes with detailed information - chromosomal locations, associated phenotypes, and AI-powered insights tailored to your education level.",
    voice: "Enthusiastic clarity",
    duration: 6000
  },
  {
    speaker: "robert",
    text: "But we go far beyond basic search. I provide clinical decision support by analyzing your uploaded medical data against specific genes or diseases.",
    voice: "Serious, professional",
    duration: 5500
  },
  {
    speaker: "anastasia",
    text: "That's where it gets really personal! Upload genetic tests, blood work, or medical reports, and we'll give you personalized insights.",
    voice: "Caring warmth",
    duration: 5000
  },
  {
    speaker: "robert",
    text: "I can analyze multiple genes simultaneously and screen for drug interactions based on your pharmacogenomic profile. Safety is paramount.",
    voice: "Deep concern",
    duration: 5500
  },
  {
    speaker: "anastasia",
    text: "And if you need someone to talk to about your results, I'm here for genetic counseling - explaining complex concepts in ways that make sense for you.",
    voice: "Compassionate support",
    duration: 5500
  },
  {
    speaker: "robert",
    text: "Our visualizations are interactive. Zoom into protein domains, explore interaction networks, analyze gene expression across tissues.",
    voice: "Technical precision",
    duration: 5000
  },
  {
    speaker: "anastasia",
    text: "We even have comparative genomics! Compare multiple genes side-by-side to understand their relationships and functional differences.",
    voice: "Excited discovery",
    duration: 5000
  },
  {
    speaker: "robert",
    text: "For researchers and clinicians, we offer premium features - population prevalence data, evolutionary history, mutation profiles, and treatment information.",
    voice: "Professional authority",
    duration: 6000
  },
  {
    speaker: "anastasia",
    text: "But remember, we're here to educate and support - not to diagnose. Always consult healthcare professionals for medical decisions.",
    voice: "Gentle reminder",
    duration: 5000
  },
  {
    speaker: "robert",
    text: "Together, Anastasia and I form a comprehensive support system for your genomic journey.",
    voice: "Confident partnership",
    duration: 4000
  },
  {
    speaker: "anastasia",
    text: "Ready to discover the genes behind your phenotypes? Let's begin your journey into personalized genomics!",
    voice: "Warm invitation",
    duration: 4500
  }
];

export default function AIConversation() {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedMessages, setDisplayedMessages] = useState([]);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedMessages]);

  const startConversation = () => {
    setIsPlaying(true);
    setCurrentIndex(0);
    setDisplayedMessages([]);
    playNext(0);
  };

  const playNext = (index) => {
    if (index >= conversation.length) {
      setIsPlaying(false);
      return;
    }

    const message = conversation[index];
    setCurrentIndex(index);
    setDisplayedMessages(prev => [...prev, message]);

    timeoutRef.current = setTimeout(() => {
      playNext(index + 1);
    }, message.duration);
  };

  const pauseConversation = () => {
    setIsPlaying(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const resumeConversation = () => {
    setIsPlaying(true);
    if (currentIndex < conversation.length - 1) {
      playNext(currentIndex + 1);
    }
  };

  const restartConversation = () => {
    pauseConversation();
    setCurrentIndex(-1);
    setDisplayedMessages([]);
    setTimeout(startConversation, 100);
  };

  const RobertAvatar = ({ isActive }) => (
    <div className={`relative ${isActive ? 'animate-pulse' : ''}`}>
      <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-lg transition-all duration-300 ${isActive ? 'ring-4 ring-purple-300 scale-110' : ''}`}>
        <Brain className="w-8 h-8 text-white" />
      </div>
      {isActive && (
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
          <Volume2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );

  const AnastasiaAvatar = ({ isActive }) => (
    <div className={`relative ${isActive ? 'animate-pulse' : ''}`}>
      <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg transition-all duration-300 ${isActive ? 'ring-4 ring-pink-300 scale-110' : ''}`}>
        <Heart className="w-8 h-8 text-white" />
      </div>
      {isActive && (
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
          <Volume2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );

  return (
    <Card className="shadow-2xl border-2 border-slate-200 overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Brain className="w-6 h-6" />
              Meet Robert & Anastasia
              <Heart className="w-6 h-6" />
            </h2>
            <p className="text-blue-100">Your AI-powered genomics support team</p>
          </div>
          <Badge className="bg-white text-purple-700 font-semibold">
            Interactive Demo
          </Badge>
        </div>
      </div>

      <CardContent className="p-0">
        {/* Conversation Display */}
        <div 
          ref={containerRef}
          className="h-[500px] overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-slate-50"
        >
          {displayedMessages.length === 0 && !isPlaying && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex gap-6 mb-6">
                <RobertAvatar isActive={false} />
                <AnastasiaAvatar isActive={false} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                Discover GeneMap's Features
              </h3>
              <p className="text-slate-600 mb-6 max-w-md">
                Join Robert and Anastasia as they walk you through the revolutionary features of GeneMap
              </p>
              <Button 
                onClick={startConversation}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 gap-2"
              >
                <Play className="w-5 h-5" />
                Start Presentation
              </Button>
            </div>
          )}

          {displayedMessages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-4 items-start animate-slideIn ${
                message.speaker === 'anastasia' ? 'flex-row-reverse' : ''
              }`}
            >
              <div className="flex-shrink-0">
                {message.speaker === 'robert' ? (
                  <RobertAvatar isActive={index === displayedMessages.length - 1 && isPlaying} />
                ) : (
                  <AnastasiaAvatar isActive={index === displayedMessages.length - 1 && isPlaying} />
                )}
              </div>
              
              <div className={`flex-1 ${message.speaker === 'anastasia' ? 'text-right' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  {message.speaker === 'robert' ? (
                    <>
                      <span className="font-bold text-purple-900">Robert</span>
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                        Clinical AI
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700 border-pink-200">
                        Genetic Counselor
                      </Badge>
                      <span className="font-bold text-pink-900">Anastasia</span>
                    </>
                  )}
                </div>
                
                <div className={`rounded-2xl p-4 shadow-md ${
                  message.speaker === 'robert' 
                    ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200' 
                    : 'bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200'
                }`}>
                  <p className="text-slate-800 leading-relaxed">{message.text}</p>
                </div>
              </div>
            </div>
          ))}

          {isPlaying && displayedMessages.length < conversation.length && (
            <div className="flex justify-center">
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-pink-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        {displayedMessages.length > 0 && (
          <div className="border-t border-slate-200 p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {!isPlaying ? (
                  <Button 
                    onClick={currentIndex === -1 ? startConversation : resumeConversation}
                    variant="outline"
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    {currentIndex === -1 ? 'Start' : 'Resume'}
                  </Button>
                ) : (
                  <Button 
                    onClick={pauseConversation}
                    variant="outline"
                    className="gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </Button>
                )}
                
                <Button 
                  onClick={restartConversation}
                  variant="outline"
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </Button>
              </div>

              <div className="text-sm text-slate-600">
                {displayedMessages.length} / {conversation.length} messages
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-3 bg-slate-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-300"
                style={{ width: `${(displayedMessages.length / conversation.length) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </CardContent>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideIn {
          animation: slideIn 0.5s ease-out;
        }
      `}</style>
    </Card>
  );
}